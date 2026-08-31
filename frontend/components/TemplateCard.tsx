"use client";

import React from "react";

interface Template {
  id: string;
  title: string;
  category: string;
  amountMin?: string;
  amountMax?: string;
  description: string;
}

export default function TemplateCard({
  template,
  onUse,
  onSave,
  onShare,
}: {
  template: Template;
  onUse: (t: Template) => void;
  onSave: (t: Template) => void;
  onShare: (t: Template) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-medium">{template.title}</h3>
          <p className="text-sm text-slate-500">{template.category}</p>
        </div>
        <div className="text-right text-sm text-slate-600">
          {template.amountMin && template.amountMax ? (
            <div>
              ${template.amountMin} - ${template.amountMax}
            </div>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-700">{template.description}</p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onUse(template)}
          className="rounded bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700"
        >
          Use Template
        </button>
        <button
          type="button"
          onClick={() => onSave(template)}
          className="rounded border px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => onShare(template)}
          className="ml-auto rounded border px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
        >
          Share
        </button>
      </div>
    </div>
  );
}
