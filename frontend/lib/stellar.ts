"use client";

import {
  Account,
  BASE_FEE,
  Contract,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
  Horizon,
} from "@stellar/stellar-sdk";
import {
  getAddress,
  isAllowed,
  requestAccess,
  signTransaction as freighterSignTransaction,
} from "@stellar/freighter-api";
import {
  type StellarNetwork,
  getPersistedNetwork,
  getNetworkConfig,
} from "@/lib/network-config";

function getActiveNetwork(): StellarNetwork {
  if (typeof window !== "undefined") {
    return getPersistedNetwork();
  }
  const envNetwork = process.env.NEXT_PUBLIC_NETWORK;
  if (envNetwork === "mainnet" || envNetwork === "testnet" || envNetwork === "futurenet") {
    return envNetwork;
  }
  return "testnet";
}

const getRpcUrl = () => getNetworkConfig(getActiveNetwork()).rpcUrl;

export type { StellarNetwork };

export function getConfiguredNetwork(): StellarNetwork | null {
  const network = getActiveNetwork();
  return network;
}

const getNetworkPassphrase = () => getNetworkConfig(getActiveNetwork()).passphrase;

export const getNetwork = (): StellarNetwork =>
  getConfiguredNetwork() ?? "testnet";

const DEFAULT_POLL_TIMEOUT = 30000;
const DEFAULT_POLL_INTERVAL = 3000;

interface TransactionResult {
  status: "SUCCESS" | "ERROR" | "PENDING";
  hash?: string;
  errorResult?: string;
  resultMetaXdr?: string;
  data?: unknown;
}

export async function connectWallet(): Promise<string> {
  const access = await requestAccess();
  if (access.error || !access.address) {
    throw new Error(access.error ?? "Wallet connection was rejected.");
  }
  return access.address;
}

export async function getPublicKey(): Promise<string | null> {
  const allowed = await isAllowed();
  if (!allowed.isAllowed) {
    return null;
  }
  const addr = await getAddress();
  return addr.error ? null : addr.address;
}

export async function getNativeBalance(publicKey: string): Promise<string> {
  try {
    const horizonUrl = getNetworkConfig(getActiveNetwork()).horizonUrl;
    const server = new Horizon.Server(horizonUrl);
    const account = await server.loadAccount(publicKey);
    const nativeBalance = account.balances.find((b) => b.asset_type === "native");
    return nativeBalance ? nativeBalance.balance : "0";
  } catch (e) {
    console.error("Error fetching balance:", e);
    return "0";
  }
}

export async function signTransaction(xdrValue: string): Promise<string> {
  const signed = await freighterSignTransaction(xdrValue, {
    networkPassphrase: getNetworkPassphrase(),
  });
  if ("error" in signed && signed.error) {
    throw new Error(signed.error);
  }
  return "signedTxXdr" in signed ? signed.signedTxXdr : signed;
}

const READONLY_SOURCE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export async function callContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  options?: { readOnly?: boolean; pollTimeout?: number },
): Promise<TransactionResult> {
  const server = new rpc.Server(getRpcUrl());
  const networkPassphrase = getNetworkPassphrase();
  const contract = new Contract(contractId);

  let account;
  if (options?.readOnly) {
    const source = await getPublicKey();
    if (source) {
      account = await server.getAccount(source);
    } else {
      account = new Account(READONLY_SOURCE, "0");
    }
  } else {
    const source = await getPublicKey();
    if (!source) {
      throw new Error("Connect Freighter before calling contract.");
    }
    account = await server.getAccount(source);
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      contract.call(method, ...args)
    )
    .setTimeout(60)
    .build();

  const simulation = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error);
  }

  if (options?.readOnly) {
    if (!rpc.Api.isSimulationSuccess(simulation)) {
      return { status: "ERROR", errorResult: "Simulation failed" };
    }
    const retval = simulation.result?.retval;
    if (!retval) {
      return { status: "ERROR", errorResult: "No return value from simulation" };
    }
    return { status: "SUCCESS", data: scValToNative(retval) };
  }

  const assembled = rpc.assembleTransaction(tx, simulation).build();
  const prepared = await server.prepareTransaction(assembled);
  const signedXdr = await signTransaction(prepared.toXDR());
  const signedTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const sent = await server.sendTransaction(signedTx);

  if (sent.status === "ERROR") {
    throw new Error(sent.errorResult?.toXDR().toString() ?? "Contract invocation failed.");
  }

  if (sent.status === "PENDING") {
    const pollTimeout = options?.pollTimeout ?? DEFAULT_POLL_TIMEOUT;
    const pollInterval = DEFAULT_POLL_INTERVAL;
    const startTime = Date.now();

    while (Date.now() - startTime < pollTimeout) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      const status = await server.getTransaction(sent.hash);

      if (status.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return {
          status: "SUCCESS",
          hash: sent.hash,
          data: status.returnValue ? scValToNative(status.returnValue) : undefined,
        };
      }

      if (status.status === rpc.Api.GetTransactionStatus.FAILED) {
        return {
          status: "ERROR",
          hash: sent.hash,
          errorResult: "Transaction failed.",
        };
      }
    }

    throw new Error(
      `Transaction timed out after ${pollTimeout}ms. Hash: ${sent.hash}`,
    );
  }

  return { status: "SUCCESS", hash: sent.hash };
}

export function decodeScVal<T = unknown>(value: xdr.ScVal): T {
  return scValToNative(value) as T;
}

export { nativeToScVal, xdr };

export function getExplorerTxUrl(txHash: string): string {
  const base = getNetworkConfig(getActiveNetwork()).explorerUrl;
  return `${base}/${txHash}`;
}

export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}
