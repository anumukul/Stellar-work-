import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("Health API Route", () => {
  it("returns status ok and valid json", async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});
