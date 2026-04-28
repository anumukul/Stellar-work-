"use client";

import { callContract, nativeToScVal } from "@/lib/stellar";
import type { Job } from "@/lib/types";

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error("Invalid hex input.");
  }
  if (!/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error("Invalid hex input.");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

export function requireContractId(): string {
  const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID ?? "";
  if (!contractId) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ID is not configured.");
  }
  return contractId;
}

export async function postJob(
  client: string,
  amount: string,
  descHashHex: string,
  deadline: string,
  tokenAddress: string,
) {
  return callContract(requireContractId(), "post_job", [
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(amount, { type: "i128" }),
    nativeToScVal(hexToBytes(descHashHex), { type: "bytes" }),
    nativeToScVal(deadline, { type: "u64" }),
    nativeToScVal(tokenAddress, { type: "address" }),
  ]);
}

export async function acceptJob(freelancer: string, jobId: string) {
  return callContract(requireContractId(), "accept_job", [
    nativeToScVal(freelancer, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

export async function submitWork(freelancer: string, jobId: string) {
  return callContract(requireContractId(), "submit_work", [
    nativeToScVal(freelancer, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

export async function approveWork(client: string, jobId: string) {
  return callContract(requireContractId(), "approve_work", [
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

export async function cancelJob(client: string, jobId: string) {
  return callContract(requireContractId(), "cancel_job", [
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

export async function enforceDeadline(client: string, jobId: string) {
  return callContract(requireContractId(), "enforce_deadline", [
    nativeToScVal(client, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

export async function extendJobTtl(caller: string, jobId: string) {
  return callContract(requireContractId(), "extend_job_ttl", [
    nativeToScVal(caller, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

export async function raiseDispute(caller: string, jobId: string) {
  return callContract(requireContractId(), "raise_dispute", [
    nativeToScVal(caller, { type: "address" }),
    nativeToScVal(jobId, { type: "u64" }),
  ]);
}

export async function resolveDispute(jobId: string, winner: string) {
  return callContract(requireContractId(), "resolve_dispute", [
    nativeToScVal(jobId, { type: "u64" }),
    nativeToScVal(winner, { type: "address" }),
  ]);
}

export async function withdrawFees(tokenAddress: string) {
  return callContract(requireContractId(), "withdraw_fees", [
    nativeToScVal(tokenAddress, { type: "address" }),
  ]);
}

export async function getFees(tokenAddress: string): Promise<number> {
  const response = await callContract(
    requireContractId(),
    "get_fees",
    [nativeToScVal(tokenAddress, { type: "address" })],
    { readOnly: true },
  );
  return Number(response ?? 0);
}

export async function addAllowedToken(tokenAddress: string) {
  return callContract(requireContractId(), "add_allowed_token", [
    nativeToScVal(tokenAddress, { type: "address" }),
  ]);
}

export async function removeAllowedToken(tokenAddress: string) {
  return callContract(requireContractId(), "remove_allowed_token", [
    nativeToScVal(tokenAddress, { type: "address" }),
  ]);
}

export async function isTokenAllowed(tokenAddress: string): Promise<boolean> {
  const response = await callContract(
    requireContractId(),
    "is_token_allowed",
    [nativeToScVal(tokenAddress, { type: "address" })],
    { readOnly: true },
  );
  return Boolean(response ?? false);
}

export async function getNativeToken(): Promise<string> {
  const response = await callContract(
    requireContractId(),
    "get_native_token",
    [],
    { readOnly: true },
  );
  return String(response ?? "");
}

export async function getJob(jobId: string): Promise<Job | null> {
  const response = await callContract(
    requireContractId(),
    "get_job",
    [nativeToScVal(jobId, { type: "u64" })],
    { readOnly: true },
  );
  return (response as Job) ?? null;
}

export async function getJobCount(): Promise<number> {
  const response = await callContract(
    requireContractId(),
    "get_job_count",
    [],
    {
      readOnly: true,
    },
  );
  return Number(response ?? 0);
}
