import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  isEnabled,
  getAllFlagNames,
  getFlagDescription,
  getDefaultFlagValue,
  getActiveFlags,
  setFlagOverride,
  clearFlagOverride,
  clearAllOverrides,
  getFlagOverrides,
  parseUrlOverrides,
  loadOverrides,
  saveOverrides,
  getFlagDefinitions,
  initFeatureFlags,
  logActiveFlags,
  getUrlOverrides,
} from "@/lib/feature-flags";

describe("Feature Flags", () => {
  beforeEach(() => {
    clearAllOverrides();
    vi.restoreAllMocks();
  });

  it("returns all defined flag names", () => {
    const names = getAllFlagNames();
    expect(names).toContain("newDashboard");
    expect(names).toContain("newMessaging");
    expect(names).toContain("biddingSystem");
    expect(names).toContain("milestones");
    expect(names).toContain("multiToken");
  });

  it("returns correct descriptions for flags", () => {
    expect(getFlagDescription("newDashboard")).toBe("New analytics dashboard layout");
    expect(getFlagDescription("newMessaging")).toBe("Redesigned messaging interface");
    expect(getFlagDescription("nonexistent")).toBe("");
  });

  it("returns false as default value for all flags", () => {
    expect(getDefaultFlagValue("newDashboard")).toBe(false);
    expect(getDefaultFlagValue("nonexistent")).toBe(false);
  });

  it("returns false for unknown flags", () => {
    expect(isEnabled("unknownFlag")).toBe(false);
  });

  it("returns default value when no overrides exist", () => {
    expect(isEnabled("newDashboard")).toBe(false);
    expect(isEnabled("newMessaging")).toBe(false);
  });

  it("respects flag overrides", () => {
    setFlagOverride("newDashboard", true);
    expect(isEnabled("newDashboard")).toBe(true);

    setFlagOverride("newDashboard", false);
    expect(isEnabled("newDashboard")).toBe(false);
  });

  it("clears individual flag overrides", () => {
    setFlagOverride("newDashboard", true);
    expect(isEnabled("newDashboard")).toBe(true);

    clearFlagOverride("newDashboard");
    expect(isEnabled("newDashboard")).toBe(false);
  });

  it("clears all overrides", () => {
    setFlagOverride("newDashboard", true);
    setFlagOverride("newMessaging", true);

    clearAllOverrides();
    expect(isEnabled("newDashboard")).toBe(false);
    expect(isEnabled("newMessaging")).toBe(false);
  });

  it("returns active flags state", () => {
    setFlagOverride("newDashboard", true);
    const active = getActiveFlags();
    expect(active.newDashboard).toBe(true);
    expect(active.newMessaging).toBe(false);
  });

  it("returns flag overrides", () => {
    setFlagOverride("biddingSystem", true);
    const overrides = getFlagOverrides();
    expect(overrides.biddingSystem).toBe(true);
  });

  it("ignores overrides for undefined flags", () => {
    setFlagOverride("nonexistentFlag", true);
    expect(isEnabled("nonexistentFlag")).toBe(false);
  });

  it("parses URL overrides correctly", () => {
    const result = parseUrlOverrides("?feature.newDashboard=true&feature.milestones=false&other=1");
    expect(result.newDashboard).toBe(true);
    expect(result.milestones).toBe(false);
    expect(result).not.toHaveProperty("other");
  });

  it("parses URL overrides with 1/0 values", () => {
    const result = parseUrlOverrides("?feature.biddingSystem=1&feature.multiToken=0");
    expect(result.biddingSystem).toBe(true);
    expect(result.multiToken).toBe(false);
  });

  it("ignores unknown flags in URL", () => {
    const result = parseUrlOverrides("?feature.unknownFlag=true");
    expect(result).not.toHaveProperty("unknownFlag");
  });

  it("URL overrides take precedence over localStorage overrides", () => {
    setFlagOverride("newDashboard", false);
    parseUrlOverrides("?feature.newDashboard=true");
    expect(isEnabled("newDashboard")).toBe(true);
  });

  it("loads overrides from localStorage", () => {
    localStorage.setItem(
      "stellarwork:feature-flags",
      JSON.stringify({ newDashboard: true, newMessaging: false })
    );
    const loaded = loadOverrides();
    expect(loaded.newDashboard).toBe(true);
    expect(loaded.newMessaging).toBe(false);
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("stellarwork:feature-flags", "not-json");
    const loaded = loadOverrides();
    expect(loaded).toEqual({});
  });

  it("filters out non-boolean values from localStorage", () => {
    localStorage.setItem(
      "stellarwork:feature-flags",
      JSON.stringify({ newDashboard: "yes", newMessaging: true, biddingSystem: 42 })
    );
    const loaded = loadOverrides();
    expect(loaded.newMessaging).toBe(true);
    expect(loaded).not.toHaveProperty("newDashboard");
    expect(loaded).not.toHaveProperty("biddingSystem");
  });

  it("saves overrides to localStorage", () => {
    saveOverrides({ newDashboard: true, milestones: false });
    const raw = localStorage.getItem("stellarwork:feature-flags");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.newDashboard).toBe(true);
    expect(parsed.milestones).toBe(false);
  });

  it("getFlagDefinitions returns a copy of definitions", () => {
    const defs = getFlagDefinitions();
    expect(defs.newDashboard).toBeDefined();
    expect(defs.newDashboard.defaultValue).toBe(false);
  });

  it("initFeatureFlags loads overrides and parses URL", () => {
    localStorage.setItem(
      "stellarwork:feature-flags",
      JSON.stringify({ newDashboard: true })
    );
    initFeatureFlags();
    expect(isEnabled("newDashboard")).toBe(true);
  });

  it("logActiveFlags does not throw", () => {
    expect(() => logActiveFlags()).not.toThrow();
  });

  it("getUrlOverrides returns parsed URL state", () => {
    parseUrlOverrides("?feature.multiToken=true");
    const urlOv = getUrlOverrides();
    expect(urlOv.multiToken).toBe(true);
  });
});
