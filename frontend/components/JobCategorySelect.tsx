"use client";

import { useState } from "react";
import { JOB_CATEGORIES, getTagsForCategory } from "@/lib/job-categories";

interface Props {
  category: string;
  tags: string[];
  onCategoryChange: (category: string) => void;
  onTagsChange: (tags: string[]) => void;
}

export function JobCategorySelect({ category, tags, onCategoryChange, onTagsChange }: Props) {
  const [customTag, setCustomTag] = useState("");
  const suggestedTags = getTagsForCategory(category);

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onCategoryChange(e.target.value);
    onTagsChange([]);
  }

  function toggleTag(tag: string) {
    onTagsChange(
      tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]
    );
  }

  function addCustomTag() {
    const t = customTag.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && !tags.includes(t)) {
      onTagsChange([...tags, t]);
    }
    setCustomTag("");
  }

  function removeTag(tag: string) {
    onTagsChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Category
        </label>
        <select
          value={category}
          onChange={handleCategoryChange}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Select a category</option>
          {JOB_CATEGORIES.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      {category && (
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Tags
          </label>

          {suggestedTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {suggestedTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    tags.includes(tag)
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomTag())}
              placeholder="Add custom tag…"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={addCustomTag}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add
            </button>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-0.5 text-blue-500 hover:text-blue-700"
                    aria-label={`Remove ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
