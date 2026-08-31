"use client";

import React, { useEffect, useMemo, useState } from "react";
import templatesData from "@/data/job-templates.json";
import TemplateCard from "@/components/TemplateCard";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";

type Template = {
  id: string;
  title: string;
  category: string;
  amountMin?: string;
  amountMax?: string;
  description: string;
};

const CUSTOM_KEY = "stellarwork:templates:custom";
const DRAFT_PREFIX = "stellarwork:post-job-draft:";

function getDraftKey(wallet: string | null) {
  return `${DRAFT_PREFIX}${wallet ?? "anonymous"}`;
}

export default function TemplatesPage() {
  const { wallet } = useWallet();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | "all">("all");
  const [customTemplates, setCustomTemplates] = useState<Template[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("development");
  const [newAmountMin, setNewAmountMin] = useState("");
  const [newAmountMax, setNewAmountMax] = useState("");
  const [newDescription, setNewDescription] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_KEY);
      if (raw) setCustomTemplates(JSON.parse(raw));
    } catch {
      setCustomTemplates([]);
    }
  }, []);

  const allTemplates = useMemo(() => {
    return [...templatesData, ...customTemplates];
  }, [customTemplates]);

  const filtered = useMemo(() => {
    return allTemplates.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      );
    });
  }, [allTemplates, category, query]);

  function saveDraftAndNavigate(template: Template) {
    const key = getDraftKey(wallet ?? null);
    const now = Date.now();
    const draft = {
      amount: template.amountMin ?? "",
      description: template.description,
      deadline: "",
      tokenAddress: process.env.NEXT_PUBLIC_NATIVE_TOKEN ?? "",
      title: template.title,
      category: template.category,
      savedAt: now,
    };
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      // ignore
    }
    router.push("/post-job");
  }

  function handleSaveCustom(t: Template) {
    const next = [t, ...customTemplates];
    setCustomTemplates(next);
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function handleShare(t: Template) {
    try {
      const encoded = encodeURIComponent(btoa(JSON.stringify(t)));
      const url = `${window.location.origin}/post-job?template=${encoded}`;
      navigator.clipboard.writeText(url);
      // Small visual feedback could be added; keep minimal.
    } catch {
      // noop
    }
  }

  function handleCreateCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle || !newDescription) return;
    const t: Template = {
      id: `custom-${Date.now()}`,
      title: newTitle,
      category: newCategory,
      amountMin: newAmountMin,
      amountMax: newAmountMax,
      description: newDescription,
    };
    const next = [t, ...customTemplates];
    setCustomTemplates(next);
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    setNewTitle("");
    setNewDescription("");
    setNewAmountMin("");
    setNewAmountMax("");
  }

  const categories = Array.from(new Set(allTemplates.map((t) => t.category))).sort();

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Job Templates</h1>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates"
          className="w-full rounded border px-3 py-2"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as any)}
          className="rounded border px-3 py-2"
        >
          <option value="all">All</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            onUse={saveDraftAndNavigate}
            onSave={handleSaveCustom}
            onShare={handleShare}
          />
        ))}
      </div>

      <div className="mt-6 rounded border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-medium">Create custom template</h2>
        <form onSubmit={handleCreateCustom} className="mt-3 space-y-2">
          <div className="grid gap-2 md:grid-cols-2">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Title" className="rounded border px-3 py-2" />
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="rounded border px-3 py-2">
              <option value="development">development</option>
              <option value="design">design</option>
              <option value="marketing">marketing</option>
              <option value="security">security</option>
            </select>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <input value={newAmountMin} onChange={(e) => setNewAmountMin(e.target.value)} placeholder="Amount min" className="rounded border px-3 py-2" />
            <input value={newAmountMax} onChange={(e) => setNewAmountMax(e.target.value)} placeholder="Amount max" className="rounded border px-3 py-2" />
          </div>
          <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Description" className="w-full rounded border px-3 py-2" rows={4} />
          <div>
            <button type="submit" className="rounded bg-sky-600 px-3 py-1 text-white">Create template</button>
          </div>
        </form>
      </div>
    </section>
  );
}
