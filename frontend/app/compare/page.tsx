"use client";

import LoadingState from "@/components/LoadingState";
import { getJob } from "@/lib/contract";
import TruncatedAddress from "@/components/TruncatedAddress";
import { formatDeadline, toXlm } from "@/lib/format";
import type { Job } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

interface JobEntry {
  id: number;
  job: Job;
}

function Field({ label, values }: { label: string; values: ReactNode[] }) {
  const stringValues = values.map((v) =>
    typeof v === "string" || typeof v === "number" ? String(v) : null,
  );
  const comparable = stringValues.every((v) => v !== null);
  const allSame =
    comparable && stringValues.every((v) => v === stringValues[0]);
  return (
    <tr>
      <th
        scope="row"
        className="whitespace-nowrap border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-700"
      >
        {label}
      </th>
      {values.map((value, index) => (
        <td
          key={index}
          className={`border border-slate-200 px-3 py-2 text-sm ${
            !allSame && comparable && values.length > 1
              ? "bg-yellow-50 font-semibold"
              : ""
          }`}
        >
          {value}
        </td>
      ))}
    </tr>
  );
}

export default function ComparePage() {
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<JobEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const idsParam = searchParams.get("ids");
    if (!idsParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    const ids = idsParam
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n > 0)
      .slice(0, 4); // max 4 jobs

    if (ids.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all(
      ids.map(async (id) => {
        const job = await getJob(String(id));
        return job ? { id, job } : null;
      }),
    )
      .then((results) => {
        const valid = results.filter((r): r is JobEntry => r !== null);
        setEntries(valid);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load jobs for comparison.");
      })
      .finally(() => setLoading(false));
  }, [searchParams]);

  const ids = searchParams.get("ids");

  if (!ids) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Compare Jobs</h1>
        <p className="text-sm text-slate-600">
          No jobs selected. Go back to{" "}
          <Link href="/" className="text-blue-600 hover:underline">
            Browse Jobs
          </Link>{" "}
          and select 2–4 jobs to compare.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Compare Jobs</h1>
        <Link
          href="/"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Back to Jobs
        </Link>
      </div>

      {loading && <LoadingState text="Loading jobs…" />}

      {error && (
        <div
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {!loading && entries.length === 0 && !error && (
        <p className="text-sm text-slate-600">
          No valid jobs found for the given IDs. Please{" "}
          <Link href="/" className="text-blue-600 hover:underline">
            go back
          </Link>{" "}
          and select again.
        </p>
      )}

      {!loading && entries.length > 0 && (
        <>
          <p className="text-xs text-slate-500">
            Cells highlighted in{" "}
            <span className="rounded bg-yellow-50 px-1 font-semibold text-yellow-800">yellow</span>{" "}
            differ across compared jobs.
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-700">
                    Field
                  </th>
                  {entries.map(({ id }) => (
                    <th
                      key={id}
                      className="border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-700"
                    >
                      <Link href={`/job/${id}`} className="text-blue-600 hover:underline">
                        Job #{id}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Field
                  label="Amount"
                  values={entries.map(({ job }) => toXlm(job.amount) + " XLM")}
                />
                <Field
                  label="Status"
                  values={entries.map(({ job }) => job.status)}
                />
                <Field
                  label="Deadline"
                  values={entries.map(({ job }) => {
                    const dl = formatDeadline(job.deadline);
                    if (!dl) return "No deadline";
                    return dl.isPast
                      ? `Past due (${dl.exact})`
                      : `${dl.relative} (${dl.exact})`;
                  })}
                />
                <Field
                  label="Created"
                  values={entries.map(({ job }) =>
                    new Date(Number(job.created_at) * 1000).toLocaleDateString(),
                  )}
                />
                <Field
                  label="Client"
                  values={entries.map(({ job }) => (
                    <TruncatedAddress key={job.client} address={job.client} />
                  ))}
                />
                <Field
                  label="Freelancer"
                  values={entries.map(({ job }) =>
                    job.freelancer ? (
                      <TruncatedAddress
                        key={job.freelancer}
                        address={job.freelancer}
                      />
                    ) : (
                      "Unassigned"
                    ),
                  )}
                />
                <Field
                  label="Description Hash"
                  values={entries.map(({ job }) =>
                    `${job.description_hash.slice(0, 12)}…`,
                  )}
                />
                <Field
                  label="Token"
                  values={entries.map(({ job }) => (
                    <TruncatedAddress key={job.token} address={job.token} />
                  ))}
                />
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3">
            {entries.map(({ id }) => (
              <Link
                key={id}
                href={`/job/${id}`}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                View Job #{id}
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
