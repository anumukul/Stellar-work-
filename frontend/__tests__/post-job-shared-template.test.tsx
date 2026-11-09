import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PostJobPage, {
  encodeSharedTemplate,
  parseSharedTemplateParam,
  MAX_SHARED_TEMPLATE_PARAM_LENGTH,
  type SharedTemplate,
} from "@/app/post-job/page";

const mockTemplateParam = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) => (key === "template" ? mockTemplateParam.value : null),
  }),
}));

const mockPostJob = vi.fn();
const mockGetDescPayloadMax = vi.fn();

vi.mock("@/lib/contract", () => ({
  buildPostJobArgs: vi.fn().mockReturnValue([]),
  getActiveContractId: vi.fn().mockReturnValue("CCONTRACT"),
  getDescPayloadMax: (...args: unknown[]) => mockGetDescPayloadMax(...args),
  postJob: (...args: unknown[]) => mockPostJob(...args),
  freelancerCancelJob: vi.fn(),
  getDescriptionCid: vi.fn(),
  storeDescriptionCid: vi.fn(),
}));

vi.mock("@/lib/ipfs-service", () => ({
  uploadToIpfs: vi.fn().mockResolvedValue("Qm123"),
  fetchFromIpfs: vi.fn(),
}));

vi.mock("@/components/RichTextEditor", () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
    labelId,
    required,
  }: {
    value: string;
    onChange: (html: string) => void;
    labelId?: string;
    required?: boolean;
  }) => (
    <textarea
      aria-labelledby={labelId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
    />
  ),
  htmlToPlainText: (html: string) => html.replace(/<[^>]+>/g, "").trim(),
}));

const WALLET_ADDRESS =
  "GWALLET000000000000000000000000000000000000000000000000000";
const DRAFT_KEY = `stellarwork:post-job-draft:${WALLET_ADDRESS}`;

vi.mock("@/lib/wallet-context", () => ({
  useWallet: () => ({
    wallet: WALLET_ADDRESS,
    walletNetwork: "TESTNET",
    connectWallet: vi.fn(),
  }),
}));

vi.mock("@/lib/stellar", () => ({
  getExplorerTxUrl: (hash: string) => `https://example.test/tx/${hash}`,
  isValidStellarAddress: (address: string) =>
    /^[GC][A-Z2-7]{55}$/.test(address.trim()),
  parseContractError: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
  getNativeBalance: vi.fn().mockResolvedValue("100"),
  retryQueuedWrites: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
  getCurrentOriginResult: () => ({
    origin: "https://stellarwork.app",
    isPlatformOrigin: true,
    reason: null,
  }),
}));

const SAMPLE_TEMPLATE: SharedTemplate = {
  id: "web-dev-frontend",
  title: "Frontend Web Developer (React/Next.js)",
  category: "development",
  amountMin: "200",
  amountMax: "1200",
  description:
    "Build responsive React/Next.js pages from Figma designs with full test coverage.",
};

describe("Shared template links on post-job page (BUG-44 / #1179)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockTemplateParam.value = null;
    mockGetDescPayloadMax.mockResolvedValue(4096);
    window.history.replaceState({}, "", "/post-job");
  });

  describe("parseSharedTemplateParam schema & boundary validation", () => {
    it("decodes and validates a standard shared template payload", () => {
      const encoded = encodeSharedTemplate(SAMPLE_TEMPLATE);
      const result = parseSharedTemplateParam(encoded);

      expect(result.error).toBeNull();
      expect(result.errorCode).toBeNull();
      expect(result.template).toEqual({
        ...SAMPLE_TEMPLATE,
        version: 1,
      });
    });

    it("supports legacy unversioned btoa(JSON.stringify(template)) share links", () => {
      const legacyEncoded = encodeURIComponent(
        btoa(JSON.stringify(SAMPLE_TEMPLATE)),
      );
      const result = parseSharedTemplateParam(legacyEncoded);

      expect(result.error).toBeNull();
      expect(result.template?.title).toBe(SAMPLE_TEMPLATE.title);
      expect(result.template?.amountMin).toBe("200");
    });

    it("rejects malformed base64 or JSON payloads", () => {
      const badBase64 = parseSharedTemplateParam("%%%not-valid-encoding%%%");
      expect(badBase64.template).toBeNull();
      expect(badBase64.errorCode).toBe("MALFORMED");

      const badJson = parseSharedTemplateParam(btoa("{not-json"));
      expect(badJson.template).toBeNull();
      expect(badJson.errorCode).toBe("MALFORMED");
    });

    it("rejects oversized query parameters and oversized descriptions", () => {
      const hugeParam = "a".repeat(MAX_SHARED_TEMPLATE_PARAM_LENGTH + 10);
      const result = parseSharedTemplateParam(hugeParam);
      expect(result.template).toBeNull();
      expect(result.errorCode).toBe("OVERSIZED");

      const hugeDescTemplate = {
        ...SAMPLE_TEMPLATE,
        description: "x".repeat(4200),
      };
      const descResult = parseSharedTemplateParam(
        btoa(JSON.stringify(hugeDescTemplate)),
        4096,
      );
      expect(descResult.template).toBeNull();
      expect(descResult.errorCode).toBe("OVERSIZED");
    });

    it("rejects unsupported template versions", () => {
      const futureTemplate = {
        ...SAMPLE_TEMPLATE,
        version: 99,
      };
      const result = parseSharedTemplateParam(
        encodeURIComponent(btoa(JSON.stringify(futureTemplate))),
      );

      expect(result.template).toBeNull();
      expect(result.errorCode).toBe("UNSUPPORTED_VERSION");
      expect(result.error).toMatch(/unsupported shared template version/i);
    });
  });

  describe("PostJobPage shared template prefill and local draft precedence", () => {
    it("prefills advertised fields and shows a review banner when no local draft exists", async () => {
      mockTemplateParam.value = encodeSharedTemplate(SAMPLE_TEMPLATE);

      render(<PostJobPage />);

      const amountInput = screen.getByLabelText(/^Amount \(XLM\)/i) as HTMLInputElement;
      const titleInput = screen.getByLabelText(/Job Title/i) as HTMLInputElement;
      const descInput = (await screen.findByLabelText(/Job Description/i)) as HTMLTextAreaElement;

      expect(amountInput.value).toBe("200");
      expect(titleInput.value).toBe("Frontend Web Developer (React/Next.js)");
      expect(descInput.value).toBe(SAMPLE_TEMPLATE.description);

      const banner = screen.getByTestId("shared-template-applied-banner");
      expect(banner).toHaveTextContent(
        /Prefilled from shared template: Frontend Web Developer/i,
      );
      expect(banner).toHaveTextContent(/suggested 200–1200 XLM/i);
    });

    it("preserves an existing local draft and prompts before applying a shared template", async () => {
      const existingDraft = {
        amount: "750",
        description: "My unsaved local draft description",
        deadline: "2027-12-31",
        tokenAddress: "GNATIVE",
        title: "Local Draft Title",
        category: "design",
        savedAt: Date.now(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(existingDraft));
      mockTemplateParam.value = encodeSharedTemplate(SAMPLE_TEMPLATE);

      render(<PostJobPage />);

      // Local draft takes initial precedence
      expect((screen.getByLabelText(/^Amount \(XLM\)/i) as HTMLInputElement).value).toBe(
        "750",
      );
      expect((screen.getByLabelText(/Job Title/i) as HTMLInputElement).value).toBe(
        "Local Draft Title",
      );
      expect(
        (screen.getByLabelText(/Job Description/i) as HTMLTextAreaElement).value,
      ).toBe("My unsaved local draft description");

      const conflictBanner = screen.getByTestId("shared-template-conflict-banner");
      expect(conflictBanner).toHaveTextContent(
        /Shared template ready: Frontend Web Developer/i,
      );

      // Clicking "Apply shared template" updates the form fields and shows the review banner
      fireEvent.click(
        screen.getByRole("button", { name: /Apply shared template/i }),
      );

      await waitFor(() => {
        expect(
          (screen.getByLabelText(/Job Title/i) as HTMLInputElement).value,
        ).toBe(SAMPLE_TEMPLATE.title);
      });
      expect(
        (screen.getByLabelText(/^Amount \(XLM\)/i) as HTMLInputElement).value,
      ).toBe("200");
      expect(
        (screen.getByLabelText(/Job Description/i) as HTMLTextAreaElement).value,
      ).toBe(SAMPLE_TEMPLATE.description);
      expect(
        screen.getByTestId("shared-template-applied-banner"),
      ).toBeInTheDocument();
    });

    it("keeps the local draft intact when malformed, oversized, or unsupported template links are opened", () => {
      const existingDraft = {
        amount: "420",
        description: "Important local draft that must not be lost",
        deadline: "",
        tokenAddress: "GNATIVE",
        title: "Preserved Local Title",
        category: "development",
        savedAt: Date.now(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(existingDraft));
      mockTemplateParam.value = encodeURIComponent(
        btoa(JSON.stringify({ ...SAMPLE_TEMPLATE, version: 42 })),
      );

      render(<PostJobPage />);

      expect(screen.getByTestId("shared-template-error")).toHaveTextContent(
        /unsupported shared template version/i,
      );
      expect((screen.getByLabelText(/Job Title/i) as HTMLInputElement).value).toBe(
        "Preserved Local Title",
      );
      expect(
        (screen.getByLabelText(/Job Description/i) as HTMLTextAreaElement).value,
      ).toBe("Important local draft that must not be lost");
      expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).title).toBe(
        "Preserved Local Title",
      );
    });
  });
});
