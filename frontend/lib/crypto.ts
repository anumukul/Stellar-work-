export function htmlToPlainText(html: string): string {
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

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyHtmlMatchesHash(html: string, expectedHash: string): Promise<boolean> {
  const plain = htmlToPlainText(html);
  const hash = await sha256Hex(plain);
  return hash === expectedHash;
}
