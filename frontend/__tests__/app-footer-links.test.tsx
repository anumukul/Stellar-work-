import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AppFooter from "@/components/AppFooter";

afterEach(cleanup);

describe("AppFooter destinations", () => {
  it.each([
    ["GitHub", "https://github.com/anumukul/Stellar-work-"],
    ["Documentation", "https://github.com/anumukul/Stellar-work-/blob/main/docs/README.md"],
    ["Tokenomics", "https://github.com/anumukul/Stellar-work-/blob/main/docs/TOKENOMICS.md"],
    ["License", "https://github.com/anumukul/Stellar-work-/blob/main/LICENSE"],
  ])("links %s to a published destination", (label, href) => {
    render(<AppFooter />);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  });
});
