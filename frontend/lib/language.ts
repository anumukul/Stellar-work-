/** ISO 639-1 language codes supported in job postings. */
export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ru: "Russian",
};

/** Comment sentinel embedded in IPFS HTML payloads to carry language metadata. */
const LANG_SENTINEL_RE = /<!--\s*stellarwork-language:\s*([a-z]{2})\s*-->/;

/**
 * Embed the given language code into an HTML job description string.
 * The sentinel comment is appended after the content so the visible HTML
 * is unaffected, and the hash is computed on the *plain-text* portion only
 * (see `htmlToPlainText` in crypto.ts), keeping the on-chain hash stable.
 */
export function embedLanguage(html: string, lang: string): string {
  const clean = html.replace(LANG_SENTINEL_RE, "").trimEnd();
  return `${clean}\n<!-- stellarwork-language: ${lang} -->`;
}

/**
 * Extract the language code embedded in a job description HTML string.
 * Returns `null` when no sentinel comment is found (legacy jobs).
 */
export function extractLanguage(html: string): string | null {
  const m = html.match(LANG_SENTINEL_RE);
  return m ? m[1] : null;
}

/**
 * Translate text using the MyMemory public translation API (no key required,
 * free tier: 1 000 words/day per IP).
 *
 * Returns the translated string, or the original `text` if the call fails or
 * the target language is already the source language.
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang = "en",
): Promise<string> {
  if (!text.trim() || targetLang === sourceLang) return text;

  try {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", text.slice(0, 500)); // API limit guard
    url.searchParams.set("langpair", `${sourceLang}|${targetLang}`);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return text;

    const json = (await res.json()) as {
      responseStatus: number;
      responseData: { translatedText: string };
    };

    if (json.responseStatus === 200 && json.responseData?.translatedText) {
      return json.responseData.translatedText;
    }
  } catch {
    // Network errors or timeout — silently fall back to original text.
  }

  return text;
}
