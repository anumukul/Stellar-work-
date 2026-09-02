import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../app/feed.xml/route";
import { getJobCount, getJob, getDescriptionCid } from "@/lib/contract";
import { fetchFromIpfs } from "@/lib/ipfs-service";
import type { Job } from "@/lib/types";

vi.mock("@/lib/contract", () => ({
  getJobCount: vi.fn(),
  getJob: vi.fn(),
  getDescriptionCid: vi.fn(),
}));

vi.mock("@/lib/ipfs-service", () => ({
  fetchFromIpfs: vi.fn(),
}));

const mockJob: Job = {
  client: "GA123456789012345678901234567890123456789012345678901234",
  freelancer: null,
  amount: "100000000",
  description_hash: "abcd",
  deadline: "1672531200", // 2023-01-01
  status: "Open",
  token: "token",
  title: "Test Job",
  category: "dev",
  created_at: "1672530000",
  revision_count: 0,
  submitted_at: "1672530000",
};

describe("RSS Feed Route (/feed.xml)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return valid RSS for empty feed case", async () => {
    vi.mocked(getJobCount).mockResolvedValue(0);

    const request = new Request("http://localhost:3000/feed.xml");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/rss+xml");
    
    const text = await response.text();
    expect(text).toContain('<?xml version="1.0" encoding="UTF-8" ?>');
    expect(text).toContain('<rss version="2.0"');
    expect(text).toContain('<title>StellarWork Open Jobs</title>');
    expect(text).not.toContain('<item>');
  });

  it("should include open jobs with titles, descriptions, and correct fields", async () => {
    vi.mocked(getJobCount).mockResolvedValue(2);
    vi.mocked(getJob).mockImplementation(async (id: string) => {
      if (id === "2") return { ...mockJob, title: "Open Job 2", status: "Open" };
      if (id === "1") return { ...mockJob, title: "Closed Job", status: "Completed" };
      return null;
    });
    vi.mocked(getDescriptionCid).mockResolvedValue("cid123");
    vi.mocked(fetchFromIpfs).mockResolvedValue("Test Description 123");

    const request = new Request("http://localhost:3000/feed.xml");
    const response = await GET(request);
    
    const text = await response.text();

    expect(text).toContain("<item>");
    expect(text).toContain("<title>Open Job 2</title>");
    expect(text).toContain("Test Description 123");
    expect(text).toContain("Amount: 10 XLM"); // 100000000 stroops = 10 XLM
    expect(text).toContain("Client: GA1234...1234");
    expect(text).toContain("<link>http://localhost:3000/job/2</link>");
    expect(text).not.toContain("Closed Job");
  });

  it("should fallback to unavailable description if IPFS fails", async () => {
    vi.mocked(getJobCount).mockResolvedValue(1);
    vi.mocked(getJob).mockResolvedValue({ ...mockJob, status: "Open" });
    vi.mocked(getDescriptionCid).mockResolvedValue("cid123");
    vi.mocked(fetchFromIpfs).mockRejectedValue(new Error("IPFS failed"));

    const request = new Request("http://localhost:3000/feed.xml");
    const response = await GET(request);
    
    const text = await response.text();
    expect(text).toContain("Description unavailable");
  });
});
