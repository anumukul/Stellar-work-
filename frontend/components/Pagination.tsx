"use client";

import React from "react";

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (s: number) => void;
  pageSizeOptions?: number[];
}

export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [10,20,50] }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  function goto(p: number) {
    const next = Math.max(1, Math.min(totalPages, p));
    if (next !== page) onPageChange(next);
  }

  const windowSize = 5;
  const half = Math.floor(windowSize / 2);
  let from = Math.max(1, page - half);
  const to = Math.min(totalPages, from + windowSize - 1);
  if (to - from < windowSize - 1) {
    from = Math.max(1, to - windowSize + 1);
  }

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
      <div
        className="text-sm text-slate-600"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        Page {page} of {totalPages}. Showing {start}-{end} of {total} results.
      </div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Go to first page" className="px-2 py-1 rounded border" onClick={() => goto(1)} disabled={page===1}>«</button>
        <button type="button" aria-label="Go to previous page" className="px-2 py-1 rounded border" onClick={() => goto(page-1)} disabled={page===1}>‹</button>
        <div className="hidden sm:flex items-center gap-1">
          {Array.from({ length: to - from + 1 }).map((_, i) => {
            const p = from + i;
            return (
              <button
                key={p}
                type="button"
                aria-label={`Go to page ${p}`}
                aria-current={p === page ? "page" : undefined}
                onClick={() => goto(p)}
                className={`px-2 py-1 rounded ${p===page?"bg-slate-900 text-white":"border"}`}
              >
                {p}
              </button>
            );
          })}
        </div>
        <button type="button" aria-label="Go to next page" className="px-2 py-1 rounded border" onClick={() => goto(page+1)} disabled={page===totalPages}>›</button>
        <button type="button" aria-label="Go to last page" className="px-2 py-1 rounded border" onClick={() => goto(totalPages)} disabled={page===totalPages}>»</button>
        {onPageSizeChange && (
          <select aria-label="Results per page" value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="ml-3 rounded border px-2 py-1 text-sm">
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>{opt} / page</option>
            ))}
          </select>
        )}
      </div>
    </nav>
  );
}
