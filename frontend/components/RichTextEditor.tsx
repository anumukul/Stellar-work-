"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useCallback } from "react";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip all HTML tags and return plain text for byte-length accounting. */
export function htmlToPlainText(html: string): string {
  // Replace block-level separators with newlines, then strip remaining tags.
  return html
    .replace(/<\/?(p|h[1-6]|li|ul|ol|br)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Toolbar button ────────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Prevent editor from losing focus on toolbar click
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={[
        "inline-flex h-7 w-7 items-center justify-center rounded text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-slate-800 text-white"
          : "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// ── Component props ───────────────────────────────────────────────────────────

export interface RichTextEditorProps {
  /** Current HTML value (controlled). */
  value: string;
  /** Called with the new HTML string whenever content changes. */
  onChange: (html: string) => void;
  /** Maximum allowed bytes for the plain-text equivalent. */
  maxBytes?: number;
  /** Field-level error message to display below the editor. */
  error?: string;
  /** Error id for aria-describedby */
  errorId?: string;
  /** Accessible label id that labels this editor (from the wrapping <label>). */
  labelId?: string;
  /** Whether the field is required. */
  required?: boolean;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RichTextEditor({
  value,
  onChange,
  maxBytes = 4096,
  error,
  errorId,
  labelId,
  required,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Descriptions are embedded below the page h1, so only h2 is exposed.
        heading: { levels: [2] },
        // Disable unsupported extensions
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
          class: "text-blue-600 underline",
        },
        validate: (href) => /^https?:\/\//i.test(href),
      }),
      Placeholder.configure({
        placeholder: "Describe the job in detail — requirements, deliverables, skills needed…",
      }),
    ],
    content: value,
    onUpdate({ editor }) {
      // Emit empty string when the doc is empty to simplify validation
      const html = editor.isEmpty ? "" : editor.getHTML();
      onChange(html);
    },
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        ...(required ? { "aria-required": "true" } : {}),
        ...(error ? { "aria-invalid": "true" } : {}),
        ...(errorId ? { "aria-describedby": errorId } : {}),
        ...(labelId ? { "aria-labelledby": labelId } : {}),
        class: [
          "min-h-[9rem] w-full px-3 py-2 text-sm text-slate-900 outline-none",
          "prose prose-sm max-w-none",
          "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-2",
          "[&_ul]:list-disc [&_ul]:pl-5",
          "[&_ol]:list-decimal [&_ol]:pl-5",
          "[&_a]:text-blue-600 [&_a]:underline",
          "[&_.is-editor-empty_p:first-child]:before:content-[attr(data-placeholder)]",
          "[&_.is-editor-empty_p:first-child]:before:text-slate-400",
          "[&_.is-editor-empty_p:first-child]:before:pointer-events-none",
          "[&_.is-editor-empty_p:first-child]:before:float-left",
          "[&_.is-editor-empty_p:first-child]:before:h-0",
        ].join(" "),
      },
    },
  });

  // Sync external value changes (e.g. form reset) without causing update loops
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (current !== value) {
      // setContent re-renders the editor; only do it when content truly differs
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  // ── Link helpers ────────────────────────────────────────────────────────────
  const setLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Enter URL (must start with https://)", previous ?? "https://");
    if (url === null) return; // cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      alert("Only http:// and https:// links are allowed.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  // ── Byte / char accounting ───────────────────────────────────────────────────
  const plainText = value ? htmlToPlainText(value) : "";
  const byteCount = new TextEncoder().encode(plainText).length;
  const isOverLimit = byteCount > maxBytes;
  const pct = Math.min(100, Math.round((byteCount / maxBytes) * 100));

  // ── Render ───────────────────────────────────────────────────────────────────
  if (!editor) return null;

  return (
    <div className="space-y-1">
      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 border-slate-300 bg-slate-50 px-1.5 py-1"
        role="toolbar"
        aria-label="Text formatting"
        aria-controls="rich-text-editor-content"
      >
        {/* Headings */}
        <ToolbarButton
          title="Heading"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

        {/* Inline marks */}
        <ToolbarButton
          title="Bold (Ctrl+B)"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          title="Italic (Ctrl+I)"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

        {/* Lists */}
        <ToolbarButton
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <circle cx="2" cy="4" r="1.5" />
            <rect x="5" y="3" width="10" height="2" rx="1" />
            <circle cx="2" cy="8" r="1.5" />
            <rect x="5" y="7" width="10" height="2" rx="1" />
            <circle cx="2" cy="12" r="1.5" />
            <rect x="5" y="11" width="10" height="2" rx="1" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <text x="0" y="5" fontSize="6" fontFamily="sans-serif">1.</text>
            <rect x="5" y="3" width="10" height="2" rx="1" />
            <text x="0" y="9.5" fontSize="6" fontFamily="sans-serif">2.</text>
            <rect x="5" y="7" width="10" height="2" rx="1" />
            <text x="0" y="14" fontSize="6" fontFamily="sans-serif">3.</text>
            <rect x="5" y="11" width="10" height="2" rx="1" />
          </svg>
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />

        {/* Link */}
        <ToolbarButton
          title="Insert / edit link"
          active={editor.isActive("link")}
          onClick={setLink}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M6.5 9.5a4.5 4.5 0 0 0 6.364 0l1.5-1.5a4.5 4.5 0 0 0-6.364-6.364L7.172 3" strokeLinecap="round" />
            <path d="M9.5 6.5a4.5 4.5 0 0 0-6.364 0l-1.5 1.5a4.5 4.5 0 0 0 6.364 6.364L8.828 13" strokeLinecap="round" />
          </svg>
        </ToolbarButton>
      </div>

      {/* Editor content area */}
      <div
        id="rich-text-editor-content"
        className={[
          "rounded-b-md border border-slate-300 bg-white",
          "focus-within:border-slate-500 focus-within:ring-1 focus-within:ring-slate-500",
          error ? "border-red-400 focus-within:border-red-500 focus-within:ring-red-500" : "",
        ].join(" ")}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Character / byte counter */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400 select-none">
          Supports <strong>bold</strong>, <em>italic</em>, headings, lists, and links
        </span>
        <span
          className={isOverLimit ? "font-medium text-red-600" : "text-slate-400"}
          aria-live="polite"
          aria-atomic="true"
        >
          {byteCount.toLocaleString()} / {maxBytes.toLocaleString()} bytes
          {isOverLimit && (
            <>
              {" "}
              <span className="sr-only">— over the limit</span>
              <span aria-hidden="true">⚠</span>
            </>
          )}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div
          className={[
            "h-full rounded-full transition-all duration-200",
            pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-blue-400",
          ].join(" ")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
