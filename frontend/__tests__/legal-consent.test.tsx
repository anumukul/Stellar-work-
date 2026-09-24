import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import LegalConsentModal, { hasAcceptedLegal, acceptLegal } from "@/components/LegalConsentModal";

describe("LegalConsentModal", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the modal with terms and privacy links", () => {
    render(<LegalConsentModal onAccept={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Terms of Service" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Terms of Service" })).toBeInTheDocument();
    const privacyLinks = screen.getAllByRole("link", { name: /Privacy Policy/i });
    expect(privacyLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("targets initial focus and restores focus when closed", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open legal modal</button>
          {open && (
            <LegalConsentModal
              onAccept={vi.fn()}
              onClose={() => setOpen(false)}
            />
          )}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open legal modal" });
    trigger.focus();
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole("checkbox")).toHaveFocus();
    });

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("disables accept button until checkbox is checked", () => {
    render(<LegalConsentModal onAccept={vi.fn()} />);
    const acceptButton = screen.getByRole("button", { name: "Accept" });
    expect(acceptButton).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(acceptButton).not.toBeDisabled();
  });

  it("calls onAccept and stores acceptance in localStorage when accepted", () => {
    const onAccept = vi.fn();
    render(<LegalConsentModal onAccept={onAccept} />);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(hasAcceptedLegal()).toBe(true);
  });

  it("calls onClose when decline is clicked", () => {
    const onClose = vi.fn();
    render(<LegalConsentModal onAccept={vi.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hasAcceptedLegal returns false when not accepted", () => {
    expect(hasAcceptedLegal()).toBe(false);
  });

  it("acceptLegal stores acceptance", () => {
    acceptLegal();
    expect(hasAcceptedLegal()).toBe(true);
  });
});
