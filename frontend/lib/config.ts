export interface AppConfig {
  contractId: string;
  network: "mainnet" | "testnet" | "futurenet";
  sorobanRpc: string;
  nativeToken: string;
  adminAddress: string;
  ipfsGatewayUrl: string;
  web3StorageToken: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  config: AppConfig;
}

const DEFAULTS = {
  network: "testnet" as const,
  sorobanRpc: "https://soroban-testnet.stellar.org",
  ipfsGatewayUrl: "https://dweb.link/ipfs/",
};

export function validateConfig(): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const contractId =
    process.env.NEXT_PUBLIC_CONTRACT_ID_TESTNET ??
    process.env.NEXT_PUBLIC_CONTRACT_ID_FUTURENET ??
    process.env.NEXT_PUBLIC_CONTRACT_ID_MAINNET ??
    process.env.NEXT_PUBLIC_CONTRACT_ID ??
    "";
  if (!contractId) {
    errors.push("NEXT_PUBLIC_CONTRACT_ID is required. Set it to the deployed escrow contract ID.");
  }

  const networkRaw = process.env.NEXT_PUBLIC_NETWORK ?? "";
  let network: "mainnet" | "testnet" | "futurenet" = DEFAULTS.network;
  if (networkRaw === "mainnet" || networkRaw === "futurenet") {
    network = networkRaw;
  } else if (networkRaw && networkRaw !== "testnet") {
    warnings.push(`NEXT_PUBLIC_NETWORK has unrecognized value "${networkRaw}", defaulting to "testnet".`);
  }

  const sorobanRpc = process.env.NEXT_PUBLIC_SOROBAN_RPC || DEFAULTS.sorobanRpc;

  const nativeToken = process.env.NEXT_PUBLIC_NATIVE_TOKEN ?? "";
  if (!nativeToken) {
    warnings.push("NEXT_PUBLIC_NATIVE_TOKEN is not set. The post-job form will require manual token address entry.");
  }

  const adminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? "";
  if (!adminAddress) {
    warnings.push("NEXT_PUBLIC_ADMIN_ADDRESS is not set. Admin panel will be disabled for safety.");
  }

  const ipfsGatewayUrl = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL || DEFAULTS.ipfsGatewayUrl;
  const web3StorageToken = process.env.NEXT_PUBLIC_WEB3_STORAGE_TOKEN ?? "";
  if (!web3StorageToken) {
    warnings.push("NEXT_PUBLIC_WEB3_STORAGE_TOKEN is not set. Job descriptions will use localStorage fallback only.");
  }

  if (network === "mainnet" && sorobanRpc.includes("testnet")) {
    warnings.push("NEXT_PUBLIC_NETWORK is \"mainnet\" but NEXT_PUBLIC_SOROBAN_RPC points to testnet. Verify the RPC endpoint.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    config: {
      contractId,
      network,
      sorobanRpc,
      nativeToken,
      adminAddress,
      ipfsGatewayUrl,
      web3StorageToken,
    },
  };
}

export function getConfig(): AppConfig {
  return validateConfig().config;
}

export function requireContractId(): string {
  const contractId =
    process.env.NEXT_PUBLIC_CONTRACT_ID_TESTNET ??
    process.env.NEXT_PUBLIC_CONTRACT_ID_FUTURENET ??
    process.env.NEXT_PUBLIC_CONTRACT_ID_MAINNET ??
    process.env.NEXT_PUBLIC_CONTRACT_ID ??
    "";
  if (!contractId) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ID is not configured.");
  }
  return contractId;
}
