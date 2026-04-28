"use client";

import {
  Account,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  nativeToScVal,
  Operation,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import {
  getAddress,
  isAllowed,
  requestAccess,
  signTransaction as freighterSignTransaction,
} from "@stellar/freighter-api";

const getRpcUrl = () =>
  process.env.NEXT_PUBLIC_SOROBAN_RPC ?? "https://soroban-testnet.stellar.org";

const getNetworkPassphrase = () =>
  process.env.NEXT_PUBLIC_NETWORK === "mainnet"
    ? Networks.PUBLIC
    : Networks.TESTNET;

export const getNetwork = () =>
  process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";

const DEFAULT_POLL_TIMEOUT = 30000;
const DEFAULT_POLL_INTERVAL = 3000;

interface TransactionResult {
  status: "SUCCESS" | "ERROR" | "PENDING";
  hash?: string;
  errorResultXdr?: string;
  resultMetaXdr?: string;
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

export async function signTransaction(xdrValue: string): Promise<string> {
  const signed = await freighterSignTransaction(xdrValue, {
    networkPassphrase: getNetworkPassphrase(),
  });
  if ("error" in signed && signed.error) {
    throw new Error(signed.error);
  }
  return "signedTxXdr" in signed ? signed.signedTxXdr : signed;
}

const READONLY_SOURCE = Keypair.random().publicKey();

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
      contract.call(method, ...args) as unknown as Operation.InvokeHostFunction,
    )
    .setTimeout(60)
    .build();

  const simulation = await server.simulateTransaction(tx);
  if ("error" in simulation && simulation.error) {
    throw new Error(simulation.error);
  }

  if (options?.readOnly) {
    const retval = simulation.result?.retval;
    if (!retval) {
      return { status: "ERROR", errorResultXdr: "No return value from simulation" };
    }
    return { status: "SUCCESS", resultMetaXdr: scValToNative(retval) as string };
  }

  const assembled = rpc.assembleTransaction(tx, simulation).build();
  const prepared = await server.prepareTransaction(assembled);
  const signedXdr = await signTransaction(prepared.toXDR());
  const signedTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const sent = await server.sendTransaction(signedTx);

  if (sent.status === "ERROR") {
    throw new Error(sent.errorResultXdr ?? "Contract invocation failed.");
  }

  if (sent.status === "PENDING") {
    const pollTimeout = options?.pollTimeout ?? DEFAULT_POLL_TIMEOUT;
    const pollInterval = DEFAULT_POLL_INTERVAL;
    const startTime = Date.now();

    while (Date.now() - startTime < pollTimeout) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      const status = await server.getTransaction(sent.hash);

      if (status.status === "SUCCESS") {
        return { status: "SUCCESS", hash: sent.hash };
      }

      if (status.status === "ERROR") {
        return {
          status: "ERROR",
          hash: sent.hash,
          errorResultXdr: status.errorResultXdr ?? "Transaction failed.",
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
  const base =
    getNetwork() === "mainnet"
      ? "https://stellar.expert/explorer/public/tx"
      : "https://stellar.expert/explorer/testnet/tx";
  return `${base}/${txHash}`;
}
