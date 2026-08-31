"use client";

export type StellarNetwork = "testnet" | "futurenet" | "mainnet";

export interface NetworkConfig {
  rpcUrl: string;
  passphrase: string;
  horizonUrl: string;
  explorerUrl: string;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotColor: string;
}

const NETWORK_CONFIGS: Record<StellarNetwork, NetworkConfig> = {
  testnet: {
    rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_TESTNET ?? "https://soroban-testnet.stellar.org",
    passphrase: "Test SDF Network ; September 2015",
    horizonUrl: "https://horizon-testnet.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/testnet/tx",
    label: "Testnet",
    badgeBg: "bg-amber-50 dark:bg-amber-950",
    badgeText: "text-amber-800 dark:text-amber-200",
    badgeBorder: "border-amber-200 dark:border-amber-800",
    dotColor: "bg-amber-500",
  },
  futurenet: {
    rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_FUTURENET ?? "https://rpc-futurenet.stellar.org",
    passphrase: "Test SDF Future Network ; October 2022",
    horizonUrl: "https://horizon-futurenet.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/futurenet/tx",
    label: "Futurenet",
    badgeBg: "bg-blue-50 dark:bg-blue-950",
    badgeText: "text-blue-800 dark:text-blue-200",
    badgeBorder: "border-blue-200 dark:border-blue-800",
    dotColor: "bg-blue-500",
  },
  mainnet: {
    rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_MAINNET ?? "https://mainnet.sorobanrpc.com",
    passphrase: "Public Global Stellar Network ; September 2015",
    horizonUrl: "https://horizon.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/public/tx",
    label: "Mainnet",
    badgeBg: "bg-emerald-50 dark:bg-emerald-950",
    badgeText: "text-emerald-800 dark:text-emerald-200",
    badgeBorder: "border-emerald-200 dark:border-emerald-800",
    dotColor: "bg-emerald-500",
  },
};

const STORAGE_KEY = "stellarwork:selected-network";

export function getDefaultNetwork(): StellarNetwork {
  const envNetwork = process.env.NEXT_PUBLIC_NETWORK;
  if (envNetwork === "mainnet" || envNetwork === "testnet" || envNetwork === "futurenet") {
    return envNetwork;
  }
  return "testnet";
}

export function getPersistedNetwork(): StellarNetwork {
  if (typeof window === "undefined") return getDefaultNetwork();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "testnet" || stored === "futurenet" || stored === "mainnet") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return getDefaultNetwork();
}

/**
 * Returns only an explicitly configured network — persisted user choice or
 * NEXT_PUBLIC_NETWORK — falling back to null when neither is set.
 */
export function getExplicitNetwork(): StellarNetwork | null {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "testnet" || stored === "futurenet" || stored === "mainnet") {
        return stored;
      }
    } catch {
      // localStorage unavailable
    }
  }
  const envNetwork = process.env.NEXT_PUBLIC_NETWORK;
  if (envNetwork === "mainnet" || envNetwork === "testnet" || envNetwork === "futurenet") {
    return envNetwork;
  }
  return null;
}

export function persistNetwork(network: StellarNetwork): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, network);
  } catch {
    // localStorage unavailable
  }
}

export function getNetworkConfig(network: StellarNetwork): NetworkConfig {
  return NETWORK_CONFIGS[network];
}

export function getContractIdForNetwork(network: StellarNetwork): string {
  switch (network) {
    case "testnet":
      return process.env.NEXT_PUBLIC_CONTRACT_ID_TESTNET ?? process.env.NEXT_PUBLIC_CONTRACT_ID ?? "";
    case "futurenet":
      return process.env.NEXT_PUBLIC_CONTRACT_ID_FUTURENET ?? process.env.NEXT_PUBLIC_CONTRACT_ID ?? "";
    case "mainnet":
      return process.env.NEXT_PUBLIC_CONTRACT_ID_MAINNET ?? process.env.NEXT_PUBLIC_CONTRACT_ID ?? "";
  }
}

export const NETWORK_LIST: StellarNetwork[] = ["testnet", "futurenet", "mainnet"];
