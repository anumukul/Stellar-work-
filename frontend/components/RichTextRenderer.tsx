"use client";

import { useEffect, useMemo, useRef } from "react";
import DOMPurify from "dompurify";

interface RichTextRendererProps {
  /** Raw HTML string from the rich text editor. */
  html: string;
  /** Optional extra className for the wrapper div. */
  className?: string;
}

/**
 * Safely renders editor-produced HTML.
 * DOMPurify strips any dangerous tags/attributes before the string is
 * handed to dangerouslySetInnerHTML, preventing XSS.
 */
export default function RichTextRenderer({ html, className }: RichTextRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const clean = useMemo(() => {
    if (typeof window === "undefined") {
      // Server-side: strip all tags as a safe fallback (SSR will be hydrated)
      return html.replace(/<[^>]+>/g, "");
    }
    const sanitized = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p", "br",
        "strong", "em", "b", "i",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "ul", "ol", "li",
        "a",
        "img",
      ],
      ALLOWED_ATTR: [
        "href", "target", "rel", "class",
        "src", "alt", "title", "width", "height",
      ],
      // Force safe link attributes — prevent javascript: hrefs
      FORCE_BODY: true,
    });
    return sanitized
      .replace(/<h[1-6]([^>]*)>/gi, "<h2$1>")
      .replace(/<\/h[1-6]>/gi, "</h2>");
  }, [html]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const images = Array.from(root.querySelectorAll("img"));
    const cleanups = images.map((image) => {
      image.setAttribute("loading", "lazy");
      image.setAttribute("decoding", "async");
      image.setAttribute("referrerpolicy", "no-referrer");
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";

      if (!image.hasAttribute("width")) image.setAttribute("width", "800");
      if (!image.hasAttribute("height")) image.setAttribute("height", "450");

      image.dataset.loaded = image.complete && image.naturalWidth > 0 ? "true" : "false";

      const markLoaded = () => {
        image.dataset.loaded = "true";
      };
      const markFailed = () => {
        image.dataset.error = "true";
        image.hidden = true;
        if (!image.nextElementSibling?.hasAttribute("data-rich-image-error")) {
          const fallback = document.createElement("div");
          fallback.setAttribute("data-rich-image-error", "true");
          fallback.setAttribute("role", "img");
          fallback.setAttribute("aria-label", image.alt || "Embedded image failed to load");
          fallback.className = "rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500";
          fallback.textContent = image.alt
            ? `Image unavailable: ${image.alt}`
            : "Embedded image unavailable";
          image.insertAdjacentElement("afterend", fallback);
        }
      };

      image.addEventListener("load", markLoaded);
      image.addEventListener("error", markFailed);

      return () => {
        image.removeEventListener("load", markLoaded);
        image.removeEventListener("error", markFailed);
      };
    });

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [clean]);

  return (
    <div
      ref={containerRef}
      className={[
        "prose prose-sm max-w-none text-sm text-slate-900",
        "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1",
        "[&_li]:my-0.5",
        "[&_a]:text-blue-600 [&_a]:underline [&_a]:break-all",
        "[&_img]:my-3 [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_img]:border [&_img]:border-slate-200 [&_img]:bg-slate-100 [&_img]:object-contain",
        "[&_img]:opacity-0 [&_img]:blur-sm [&_img]:transition-all [&_img]:duration-300",
        "[&_img[data-loaded='true']]:opacity-100 [&_img[data-loaded='true']]:blur-0",
        "[&_p]:my-1",
        className ?? "",
      ].join(" ")}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

// ── Plain-text fallback renderer ──────────────────────────────────────────────
// Used for the description_hash tooltip / copy area and for non-HTML content.

interface PlainTextRendererProps {
  text: string;
  className?: string;
}

/** Renders plain text with whitespace preserved. */
export function PlainTextRenderer({ text, className }: PlainTextRendererProps) {
  return (
    <p className={["whitespace-pre-wrap text-sm text-slate-900", className ?? ""].join(" ")}>
      {text}
    </p>
  );
}

/** Returns true if the string looks like editor-produced HTML. */
export function isRichText(content: string): boolean {
  return /^<[a-z]/i.test(content.trimStart());
}
