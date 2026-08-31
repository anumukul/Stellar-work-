import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletProvider, useWallet } from "@/lib/wallet-context";

const mockConnectWallet = vi.fn();
const mockGetPublicKey = vi.fn();
const mockGetWalletNetwork = vi.fn();
const mockWatchWalletNetworkChanges = vi.fn();

vi.mock("@/lib/stellar", () => ({
  connectWallet: (...args: unknown[]) => mockConnectWallet(...args),
  getPublicKey: (...args: unknown[]) => mockGetPublicKey(...args),
  getWalletNetwork: (...args: unknown[]) => mockGetWalletNetwork(...args),
  watchWalletNetworkChanges: (...args: unknown[]) =>
    mockWatchWalletNetworkChanges(...args),
}));

function WalletProbe() {
  const { wallet, walletNetwork, connectWallet, disconnectWallet } = useWallet();
  return (
    <div>
      <p data-testid="wallet">{wallet ?? "none"}</p>
      <p data-testid="wallet-network">{walletNetwork ?? "none"}</p>
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
    localStorage.clear();
    sessionStorage.clear();
    mockGetWalletNetwork.mockResolvedValue("testnet");
    mockWatchWalletNetworkChanges.mockReturnValue(() => undefined);
  });

  it("propagates provider state to consumers when auto-reconnect is enabled", async () => {
    localStorage.setItem("stellarwork:wallet-auto-reconnect", "true");
    mockGetPublicKey.mockResolvedValue("GINITIALWALLET");

    render(
      <WalletProvider>
        <WalletProbe />
      </WalletProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("wallet")).toHaveTextContent("GINITIALWALLET"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("wallet-network")).toHaveTextContent("testnet"),
    );
    expect(localStorage.getItem("stellarwork:last-connected-account")).toBe(
      "GINITIALWALLET",
    );
  });

  it("skips auto-reconnect after an explicit disconnect", async () => {
    localStorage.setItem("stellarwork:wallet-auto-reconnect", "false");
    mockGetPublicKey.mockResolvedValue("GSHOULDNOTCONNECT");

    render(
      <WalletProvider>
        <WalletProbe />
      </WalletProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("wallet")).toHaveTextContent("none"),
    );
    expect(mockGetPublicKey).not.toHaveBeenCalled();
  });

  it("clears stale persistence when Freighter no longer allows access", async () => {
    localStorage.setItem("stellarwork:wallet-auto-reconnect", "true");
    localStorage.setItem(
      "stellarwork:last-connected-account",
      "GSTALEWALLET",
    );
    mockGetPublicKey.mockResolvedValue(null);

    render(
      <WalletProvider>
        <WalletProbe />
      </WalletProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("wallet")).toHaveTextContent("none"),
    );
    expect(localStorage.getItem("stellarwork:last-connected-account")).toBeNull();
    expect(localStorage.getItem("stellarwork:wallet-auto-reconnect")).toBe(
      "false",
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
    expect(localStorage.getItem("stellarwork:wallet-auto-reconnect")).toBe(
      "true",
    );
    await waitFor(() =>
      expect(screen.getByTestId("wallet-network")).toHaveTextContent("testnet"),
    );

    fireEvent.click(screen.getByRole("button", { name: "disconnect" }));
    expect(screen.getByTestId("wallet")).toHaveTextContent("none");
    expect(screen.getByTestId("wallet-network")).toHaveTextContent("none");
    expect(localStorage.getItem("stellarwork:wallet-auto-reconnect")).toBe(
      "false",
    );
    expect(localStorage.getItem("stellarwork:last-connected-account")).toBeNull();
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
