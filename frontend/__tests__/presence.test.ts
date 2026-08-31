import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  computeStatus,
  formatLastSeen,
  isPresenceDisabled,
  setPresenceDisabled,
  type PresenceStatus,
} from "@/lib/presence";

describe("presence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("computeStatus", () => {
    it("returns unknown for null data", () => {
      expect(computeStatus(null)).toBe("unknown");
    });

    it("returns offline when not online", () => {
      expect(
        computeStatus({ address: "G...", lastActive: Date.now(), online: false }),
      ).toBe("offline");
    });

    it("returns online when active within 5 minutes", () => {
      expect(
        computeStatus({
          address: "G...",
          lastActive: Date.now() - 2 * 60 * 1000,
          online: true,
        }),
      ).toBe("online");
    });

    it("returns away when active 5-30 minutes ago", () => {
      expect(
        computeStatus({
          address: "G...",
          lastActive: Date.now() - 10 * 60 * 1000,
          online: true,
        }),
      ).toBe("away");
    });

    it("returns offline when active more than 30 minutes ago", () => {
      expect(
        computeStatus({
          address: "G...",
          lastActive: Date.now() - 60 * 60 * 1000,
          online: true,
        }),
      ).toBe("offline");
    });
  });

  describe("formatLastSeen", () => {
    it("returns empty string for null data", () => {
      expect(formatLastSeen(null)).toBe("");
    });

    it("returns Just now for recent activity", () => {
      expect(
        formatLastSeen({ address: "G...", lastActive: Date.now() - 10_000, online: true }),
      ).toBe("Just now");
    });

    it("returns minutes for activity within an hour", () => {
      expect(
        formatLastSeen({
          address: "G...",
          lastActive: Date.now() - 15 * 60 * 1000,
          online: true,
        }),
      ).toBe("15m ago");
    });

    it("returns hours for activity within a day", () => {
      expect(
        formatLastSeen({
          address: "G...",
          lastActive: Date.now() - 3 * 60 * 60 * 1000,
          online: true,
        }),
      ).toBe("3h ago");
    });

    it("returns days for old activity", () => {
      expect(
        formatLastSeen({
          address: "G...",
          lastActive: Date.now() - 5 * 24 * 60 * 60 * 1000,
          online: true,
        }),
      ).toBe("5d ago");
    });
  });

  describe("presence preferences", () => {
    it("isPresenceDisabled returns false by default", () => {
      expect(isPresenceDisabled()).toBe(false);
    });

    it("setPresenceDisabled persists preference", () => {
      setPresenceDisabled(true);
      expect(isPresenceDisabled()).toBe(true);
      setPresenceDisabled(false);
      expect(isPresenceDisabled()).toBe(false);
    });
  });
});
