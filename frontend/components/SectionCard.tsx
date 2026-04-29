"use client";

import { ReactNode } from "react";

interface SectionCardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export default function SectionCard({
  title,
  description,
  children,
  className = "",
}: SectionCardProps) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-5 ${className}`.trim()}>
      {(title || description) && (
        <div className="mb-3">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
