"use client";

import { postJob } from "@/lib/contract";
import ErrorBanner from "@/components/ErrorBanner";
import { getExplorerTxUrl } from "@/lib/stellar";
import { useWallet } from "@/lib/wallet-context";
import { useState } from "react";

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function PostJobPage() {
  const { wallet, connectWallet } = useWallet();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [tokenAddress, setTokenAddress] = useState(
    process.env.NEXT_PUBLIC_NATIVE_TOKEN ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Post Job</h1>

      <form
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setSuccess(null);
          setTxHash(null);

          if (!wallet) {
            try {
              await connectWallet();
            } catch {
              setError("Failed to connect wallet. Is Freighter installed?");
            }
            return;
          }

          setSubmitting(true);
          try {
            const amountStroops = Math.floor(Number(amount || "0") * 10_000_000);
            const hashHex = await sha256Hex(description);
            const deadlineUnix = deadline
              ? Math.floor(new Date(deadline).getTime() / 1000).toString()
              : "0";

            localStorage.setItem(`job-desc:${hashHex}`, description);
            const result = await postJob(wallet, String(amountStroops), hashHex, deadlineUnix, tokenAddress);
            if (result.hash) {
              setTxHash(result.hash);
            }
            const jobId = typeof result === "number" || typeof result === "string" ? result : null;
            setSuccess(jobId != null ? `Job #${jobId} created successfully.` : "Job submitted to contract.");
            setAmount("");
            setDescription("");
            setDeadline("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to post job. Please try again.");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <label className="block text-sm font-medium">
          Amount (XLM)
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            type="number"
            min="0"
            step="0.0000001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>

        <label className="block text-sm font-medium">
          Job Description
          <textarea
            className="mt-1 min-h-36 w-full rounded-md border border-slate-300 px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </label>

        <label className="block text-sm font-medium">
          Deadline (optional)
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>

        <label className="block text-sm font-medium">
          Token Address
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
            type="text"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            required
          />
        </label>

        <button
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? "Posting..." : "Post Job"}
        </button>
      </form>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {success && <p role="status" aria-live="polite" className="rounded-md bg-green-100 p-3 text-sm text-green-700">{success}</p>}
      {txHash && (
        <p className="text-sm text-slate-600">
          Transaction:{" "}
          <a
            href={getExplorerTxUrl(txHash)}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline"
          >
            {txHash}
          </a>
        </p>
      )}
    </section>
  );
}
