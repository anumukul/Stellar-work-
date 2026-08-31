import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import JobCelebrationModal from "@/components/JobCelebrationModal";
import { ToastProvider } from "@/components/ToastProvider";

const mockShowSuccess = vi.fn();

vi.mock("@/components/ToastProvider", () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useToast: () => ({
    showSuccess: mockShowSuccess,
    showError: vi.fn(),
    showPending: vi.fn(),
  }),
}));

describe("JobCelebrationModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock HTMLCanvasElement getContext
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
    });

    // Mock matchMedia
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <JobCelebrationModal
        isOpen={false}
        onClose={vi.fn()}
        jobId="42"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders celebration modal with job title, completion badge, and stats", () => {
    render(
      <JobCelebrationModal
        isOpen={true}
        onClose={vi.fn()}
        jobId="42"
        jobTitle="Stellar Smart Contract"
        amount="5000000000"
        token="XLM"
        createdAt={Math.floor(Date.now() / 1000) - 7200} // 2 hours ago
        completedAt={Math.floor(Date.now() / 1000)}
        isClient={true}
      />
    );

    expect(screen.getByText("Celebration Time!")).toBeInTheDocument();
    expect(screen.getByText("Job Completed & Approved")).toBeInTheDocument();
    expect(screen.getByText("Stellar Smart Contract")).toBeInTheDocument();
    expect(screen.getByTestId("stat-duration")).toHaveTextContent("2h");
    expect(screen.getByTestId("stat-amount")).toHaveTextContent("500.00 XLM");
    expect(screen.getByTestId("stat-rating")).toBeInTheDocument();
  });

  it("renders confetti canvas when reduced motion is not preferred", () => {
    render(
      <JobCelebrationModal
        isOpen={true}
        onClose={vi.fn()}
        jobId="42"
        forceReducedMotion={false}
      />
    );

    expect(screen.getByTestId("celebration-canvas")).toBeInTheDocument();
  });

  it("suppresses confetti canvas when reduced motion is enabled", () => {
    render(
      <JobCelebrationModal
        isOpen={true}
        onClose={vi.fn()}
        jobId="42"
        forceReducedMotion={true}
      />
    );

    expect(screen.queryByTestId("celebration-canvas")).not.toBeInTheDocument();
  });

  it("calls onClose when close (X) button is clicked", () => {
    const handleClose = vi.fn();
    render(
      <JobCelebrationModal
        isOpen={true}
        onClose={handleClose}
        jobId="42"
      />
    );

    fireEvent.click(screen.getByTestId("celebration-close-btn"));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop overlay is clicked", () => {
    const handleClose = vi.fn();
    render(
      <JobCelebrationModal
        isOpen={true}
        onClose={handleClose}
        jobId="42"
      />
    );

    fireEvent.click(screen.getByTestId("celebration-backdrop"));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Done button is clicked", () => {
    const handleClose = vi.fn();
    render(
      <JobCelebrationModal
        isOpen={true}
        onClose={handleClose}
        jobId="42"
      />
    );

    fireEvent.click(screen.getByTestId("celebration-done-btn"));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const handleClose = vi.fn();
    render(
      <JobCelebrationModal
        isOpen={true}
        onClose={handleClose}
        jobId="42"
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("allows client to submit a star rating", async () => {
    const handleRate = vi.fn().mockResolvedValue(undefined);
    render(
      <JobCelebrationModal
        isOpen={true}
        onClose={vi.fn()}
        jobId="42"
        isClient={true}
        onRate={handleRate}
      />
    );

    expect(screen.getByText("Rate your experience with this freelancer:")).toBeInTheDocument();

    const star4 = screen.getByTestId("rate-star-4");
    fireEvent.click(star4);

    await waitFor(() => {
      expect(handleRate).toHaveBeenCalledWith(4);
    });
    expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("4 stars"));
  });

  it("handles social share buttons (Twitter, LinkedIn, Telegram)", () => {
    const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <JobCelebrationModal
        isOpen={true}
        onClose={vi.fn()}
        jobId="42"
        jobTitle="Audit Escrow"
      />
    );

    fireEvent.click(screen.getByTestId("share-twitter-btn"));
    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining("twitter.com/intent/tweet"),
      "_blank",
      "noopener,noreferrer"
    );

    fireEvent.click(screen.getByTestId("share-linkedin-btn"));
    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining("linkedin.com/sharing"),
      "_blank",
      "noopener,noreferrer"
    );

    fireEvent.click(screen.getByTestId("share-telegram-btn"));
    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining("t.me/share"),
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("copies shareable link to clipboard and shows feedback", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <JobCelebrationModal
        isOpen={true}
        onClose={vi.fn()}
        jobId="42"
      />
    );

    fireEvent.click(screen.getByTestId("share-copy-link-btn"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("/job/42"));
      expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("copied to clipboard"));
    });
  });

  it("shows certificate button for freelancer and invokes download", () => {
    const handleDownload = vi.fn();
    render(
      <JobCelebrationModal
        isOpen={true}
        onClose={vi.fn()}
        jobId="42"
        isFreelancer={true}
        isClient={false}
        onDownloadCertificate={handleDownload}
      />
    );

    const certBtn = screen.getByTestId("celebration-certificate-btn");
    expect(certBtn).toBeInTheDocument();

    fireEvent.click(certBtn);
    expect(handleDownload).toHaveBeenCalledTimes(1);
  });
});
