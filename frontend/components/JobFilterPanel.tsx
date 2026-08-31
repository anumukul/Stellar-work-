"use client";

import { useEffect, useRef, useState } from "react";

export type FreelancerFilter = "all" | "unassigned" | "assigned";
export type DateRangeFilter = "all" | "24h" | "7d" | "30d";

export interface JobFilters {
  minAmount: string;
  maxAmount: string;
  dateRange: DateRangeFilter;
  freelancerStatus: FreelancerFilter;
  language: string;
}

export const DEFAULT_FILTERS: JobFilters = {
  minAmount: "",
  maxAmount: "",
  dateRange: "all",
  freelancerStatus: "all",
  language: "all",
};

function isDefaultFilters(f: JobFilters): boolean {
  return (
    f.minAmount === "" &&
    f.maxAmount === "" &&
    f.dateRange === "all" &&
    f.freelancerStatus === "all" &&
    f.language === "all"
  );
}

interface JobFilterPanelProps {
  filters: JobFilters;
  onChange: (filters: JobFilters) => void;
  resultCount: number;
}

export default function JobFilterPanel({ filters, onChange, resultCount }: JobFilterPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced amount change to avoid hammering on every keystroke.
  function handleAmountChange(field: "minAmount" | "maxAmount", value: string) {
    const next = { ...filters, [field]: value };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(next), 300);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasActiveFilters = !isDefaultFilters(filters);

  function clearAll() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChange(DEFAULT_FILTERS);
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
          aria-expanded={expanded}
          aria-controls="filter-panel-body"
        >
          <svg className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM9 15a1 1 0 011-1h6a1 1 0 110 2h-6a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
          Filters
          {hasActiveFilters && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">
              {Object.values(filters).filter((v) => v !== "" && v !== "all").length}
            </span>
          )}
        </button>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {resultCount} {resultCount === 1 ? "result" : "results"}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 px-4 pb-3" aria-label="Active filters">
          {filters.minAmount && (
            <FilterChip
              label={`Min: ${filters.minAmount} XLM`}
              onRemove={() => onChange({ ...filters, minAmount: "" })}
            />
          )}
          {filters.maxAmount && (
            <FilterChip
              label={`Max: ${filters.maxAmount} XLM`}
              onRemove={() => onChange({ ...filters, maxAmount: "" })}
            />
          )}
          {filters.dateRange !== "all" && (
            <FilterChip
              label={{ "24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days" }[filters.dateRange]}
              onRemove={() => onChange({ ...filters, dateRange: "all" })}
            />
          )}
          {filters.freelancerStatus !== "all" && (
            <FilterChip
              label={filters.freelancerStatus === "unassigned" ? "No freelancer" : "Has freelancer"}
              onRemove={() => onChange({ ...filters, freelancerStatus: "all" })}
            />
          )}
          {filters.language !== "all" && (
            <FilterChip
              label={`Language: ${filters.language}`}
              onRemove={() => onChange({ ...filters, language: "all" })}
            />
          )}
        </div>
      )}

      {/* Expandable panel */}
      {expanded && (
        <div
          id="filter-panel-body"
          className="border-t border-slate-100 px-4 py-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {/* Amount range */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Min Amount (XLM)
            </label>
            <input
              type="number"
              min="0"
              step="any"
              defaultValue={filters.minAmount}
              onChange={(e) => handleAmountChange("minAmount", e.target.value)}
              placeholder="e.g. 10"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Max Amount (XLM)
            </label>
            <input
              type="number"
              min="0"
              step="any"
              defaultValue={filters.maxAmount}
              onChange={(e) => handleAmountChange("maxAmount", e.target.value)}
              placeholder="e.g. 1000"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-date" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Date Posted
            </label>
            <select
              id="filter-date"
              value={filters.dateRange}
              onChange={(e) => onChange({ ...filters, dateRange: e.target.value as DateRangeFilter })}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">Any time</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>

          {/* Freelancer status */}
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-freelancer" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Freelancer
            </label>
            <select
              id="filter-freelancer"
              value={filters.freelancerStatus}
              onChange={(e) => onChange({ ...filters, freelancerStatus: e.target.value as FreelancerFilter })}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All jobs</option>
              <option value="unassigned">Unassigned</option>
              <option value="assigned">Assigned</option>
            </select>
          </div>

          {/* Language filter */}
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-language" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Language
            </label>
            <select
              id="filter-language"
              value={filters.language}
              onChange={(e) => onChange({ ...filters, language: e.target.value })}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">Any language</option>
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="pt">Portuguese</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="ru">Russian</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className="flex h-4 w-4 items-center justify-center rounded-full text-blue-600 hover:bg-blue-100"
      >
        ×
      </button>
    </span>
  );
}
