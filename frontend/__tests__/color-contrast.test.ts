import { describe, expect, it } from "vitest";

const approvedPairs = [
  { name: "primary button", foreground: "#ffffff", background: "#0f172a" },
  { name: "danger button", foreground: "#ffffff", background: "#dc2626" },
  { name: "warning badge", foreground: "#92400e", background: "#fffbeb" },
  { name: "evidence badge", foreground: "#2563eb", background: "#eff6ff" },
  { name: "review badge", foreground: "#7c3aed", background: "#f5f3ff" },
  { name: "resolved badge", foreground: "#065f46", background: "#ecfdf5" },
  { name: "closed badge", foreground: "#334155", background: "#f1f5f9" },
  { name: "light theme body", foreground: "#0f172a", background: "#f8fafc" },
  { name: "dark theme body", foreground: "#f1f5f9", background: "#0f172a" },
];

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("approved color contrast pairs", () => {
  it.each(approvedPairs)("$name meets WCAG AA normal-text contrast", ({ foreground, background }) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
