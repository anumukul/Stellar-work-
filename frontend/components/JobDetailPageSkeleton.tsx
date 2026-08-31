export default function JobDetailPageSkeleton() {
  return (
    <section
      className="space-y-6 pb-6"
      aria-label="Loading job details"
      aria-busy="true"
    >
      <div className="flex items-center gap-4" aria-hidden="true">
        <div className="h-5 w-12 rounded bg-slate-200" />
        <div className="h-8 w-32 rounded bg-slate-200" />
      </div>

      <div
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-5"
        aria-hidden="true"
      >
        <div className="h-4 w-24 rounded bg-slate-200" />
        <div className="h-6 w-40 rounded bg-slate-200" />
        <div className="h-4 w-full rounded bg-slate-200" />
        <div className="h-4 w-5/6 rounded bg-slate-200" />
      </div>

      <div
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-5"
        aria-hidden="true"
      >
        <div className="h-5 w-32 rounded bg-slate-200" />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="h-24 rounded-lg bg-slate-100" />
          <div className="h-24 rounded-lg bg-slate-100" />
        </div>
      </div>

      <div
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-5"
        aria-hidden="true"
      >
        <div className="h-5 w-36 rounded bg-slate-200" />
        <div className="h-24 rounded-lg bg-slate-100" />
      </div>

      <div className="flex items-center gap-2" role="status" aria-live="polite">
        <div className="h-4 w-4 animate-pulse rounded-full bg-slate-300" />
        <span className="text-sm text-slate-600">Preparing job details</span>
      </div>
      <div className="sr-only">Loading job details...</div>
    </section>
  );
}
