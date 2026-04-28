import { describe, expect, it } from "vitest";
import { generateMetadata } from "@/app/profile/[address]/page";

describe("profile route metadata", () => {
  it("includes valid route address in title", async () => {
    const address = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

    const metadata = await generateMetadata({
      params: { address },
    });

    expect(metadata.title).toBe(`Profile | ${address} | StellarWork`);
    expect(metadata.description).toContain(address);
  });

  it("returns fallback title for invalid address", async () => {
    const metadata = await generateMetadata({
      params: { address: "not-a-stellar-address" },
    });

    expect(metadata.title).toBe("Profile | Invalid Address | StellarWork");
  });
});
