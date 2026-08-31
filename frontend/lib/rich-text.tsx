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