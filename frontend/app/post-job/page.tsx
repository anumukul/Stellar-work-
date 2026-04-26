"use client";

import { postJob } from "@/lib/contract";
import { connectWallet } from "@/lib/stellar";
import { useState } from "react";

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function PostJobPage() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [tokenAddress, setTokenAddress] = useState(
    process.env.NEXT_PUBLIC_NATIVE_TOKEN ?? "",
  );
  const [status, setStatus] = useState<string | null>(null);

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Post Job</h1>
        <button
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          onClick={async () => {
            setWallet(await connectWallet());
          }}
        >
          {wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "Connect Wallet"}
        </button>
      </div>

      <form
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!wallet) {
            setStatus("Connect wallet first.");
            return;
          }

          const amountStroops = Math.floor(Number(amount || "0") * 10_000_000);
          const hashHex = await sha256Hex(description);
          const deadlineUnix = deadline
            ? Math.floor(new Date(deadline).getTime() / 1000).toString()
            : "0";

          localStorage.setItem(`job-desc:${hashHex}`, description);
          await postJob(wallet, String(amountStroops), hashHex, deadlineUnix, tokenAddress);
          setStatus("Job submitted to contract.");
          setAmount("");
          setDescription("");
          setDeadline("");
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

        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Post Job
        </button>
      </form>

      {status && <p className="text-sm text-slate-700">{status}</p>}
    </section>
  );
}
