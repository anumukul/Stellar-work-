"use client";



type AriaLiveRegionProps = {
  /** The text to announce. Changing this value triggers an announcement. */
  message: string;
  /**
   * "polite" — waits for user to finish current activity (default).
   * "assertive" — interrupts the user immediately. Use for errors only.
   */
  politeness?: "polite" | "assertive";
  /**
   * role="status" for informational updates (polite).
   * role="alert" for errors and urgent messages (assertive).
   * role="log" for appended streams (e.g. chat, job feed updates).
   */
  role?: "status" | "alert" | "log";
  /**
   * When true the entire region is announced as one unit on each update.
   * Defaults to true for status/alert, false for log.
   */
  atomic?: boolean;
  /** When true, renders the region inline rather than sr-only. */
  visible?: boolean;
  className?: string;
};

export default function AriaLiveRegion({
  message,
  politeness = "polite",
  role = politeness === "assertive" ? "alert" : "status",
  atomic,
  visible = false,
  className,
}: AriaLiveRegionProps) {
  // Default atomic: true for status/alert, false for log
  const resolvedAtomic = atomic ?? role !== "log";

  return (
    <p
      role={role}
      aria-live={politeness}
      aria-atomic={resolvedAtomic}
      className={visible ? className : `sr-only${className ? ` ${className}` : ""}`}
    >
      {message}
    </p>
  );
}
