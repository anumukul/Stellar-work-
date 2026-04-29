"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * ScrollRestorer
 *
 * Handles scroll behavior on route transitions in the Next.js App Router:
 *
 * 1. Hash links (deep-links): When the URL contains a `#fragment`, the browser
 *    native anchor scroll is preserved. We do NOT override it.
 *
 * 2. New-page navigation (no hash): Scroll is instantly reset to the top of the
 *    page without any visible jump, because the reset happens synchronously
 *    before the browser paints the new page content.
 *
 * 3. Same-pathname hash changes: When only the hash changes on the same path
 *    (e.g. clicking a TOC link), we let the browser handle the anchor scroll
 *    natively — no interference.
 *
 * This component must be rendered inside the root layout so it is mounted for
 * the entire session and reacts to every pathname change.
 */
export function ScrollRestorer() {
  const pathname = usePathname();
  const prevPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    // Read the hash *after* the navigation has committed so the URL is current.
    const hash = window.location.hash;

    // If the page has a deep-link hash, let the browser scroll to the anchor
    // natively. We only reset scroll on plain page navigations.
    if (hash) {
      // The browser already handles scrolling to the anchor element, but the
      // element may not exist yet if content is streamed / async. Attempt a
      // deferred scroll-into-view as a fallback without disrupting the normal
      // case.
      const id = hash.slice(1); // strip leading '#'
      const el = document.getElementById(id);
      if (el) {
        // Element already in DOM — scroll immediately.
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        // Element not yet rendered (e.g. lazy section). Try once after a short
        // delay so streamed content has time to mount.
        const timer = setTimeout(() => {
          const deferred = document.getElementById(id);
          if (deferred) {
            deferred.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 100);
        return () => clearTimeout(timer);
      }

      prevPathnameRef.current = pathname;
      return;
    }

    // No hash — this is a clean page navigation. Reset to top immediately so
    // there is no visible jump when the new page content renders.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    prevPathnameRef.current = pathname;
  }, [pathname]);

  // This component renders nothing — it is a behaviour-only side-effect hook.
  return null;
}
