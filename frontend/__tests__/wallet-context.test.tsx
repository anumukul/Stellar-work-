import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletProvider, useWallet } from "@/lib/wallet-context";

const mockConnectWallet = vi.fn();
const mockGetPublicKey = vi.fn();

vi.mock("@/lib/stellar", () => ({
  connectWallet: (...args: unknown[]) => mockConnectWallet(...args),
  getPublicKey: (...args: unknown[]) => mockGetPublicKey(...args),
}));

function WalletProbe() {
  const { wallet, connectWallet, disconnectWallet } = useWallet();
  return (
    <div>
      <p data-testid="wallet">{wallet ?? "none"}</p>
      <button type="button" onClick={() => void connectWallet()}>
        connect
      </button>
      <button type="button" onClick={disconnectWallet}>
        disconnect
      </button>
    </div>
  );
}

function WalletErrorProbe() {
  const { connectWallet } = useWallet();
  const [error, setError] = React.useState("none");

  return (
    <div>
      <p data-testid="error">{error}</p>
      <button
        type="button"
        onClick={async () => {
          try {
            await connectWallet();
          } catch (err) {
            setError(err instanceof Error ? err.message : "unknown");
          }
        }}
      >
        connect with error handling
      </button>
    </div>
  );
}

describe("WalletProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("propagates provider state to consumers", async () => {
    mockGetPublicKey.mockResolvedValue("GINITIALWALLET");

    render(
      <WalletProvider>
        <WalletProbe />
      </WalletProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("wallet")).toHaveTextContent("GINITIALWALLET"),
    );
  });

  it("handles connect and disconnect behavior", async () => {
    mockGetPublicKey.mockResolvedValue(null);
    mockConnectWallet.mockResolvedValue("GCONNECTEDWALLET");

    render(
      <WalletProvider>
        <WalletProbe />
      </WalletProvider>,
    );

    expect(screen.getByTestId("wallet")).toHaveTextContent("none");

    fireEvent.click(screen.getByRole("button", { name: "connect" }));
    await waitFor(() =>
      expect(screen.getByTestId("wallet")).toHaveTextContent("GCONNECTEDWALLET"),
    );

    fireEvent.click(screen.getByRole("button", { name: "disconnect" }));
    expect(screen.getByTestId("wallet")).toHaveTextContent("none");
  });

  it("surfaces connect errors to consumer callers", async () => {
    mockGetPublicKey.mockResolvedValue(null);
    mockConnectWallet.mockRejectedValue(new Error("freighter unavailable"));

    render(
      <WalletProvider>
        <WalletErrorProbe />
      </WalletProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "connect with error handling" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent(
        "freighter unavailable",
      ),
    );
  });
});
