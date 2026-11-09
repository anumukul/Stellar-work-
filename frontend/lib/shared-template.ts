export const SHARED_TEMPLATE_VERSION = 1;
export const MAX_SHARED_TEMPLATE_PARAM_LENGTH = 8192;
export const MAX_SHARED_TEMPLATE_JSON_BYTES = 6144;
export const MAX_TEMPLATE_TITLE_BYTES = 64;
export const MAX_TEMPLATE_DESCRIPTION_BYTES = 4096;
export const MAX_TEMPLATE_ID_LENGTH = 128;
export const MAX_TEMPLATE_CATEGORY_LENGTH = 64;

export interface SharedTemplate {
  id: string;
  title: string;
  category: string;
  amountMin?: string;
  amountMax?: string;
  description: string;
  version?: number;
}

export type SharedTemplateErrorCode =
  | "OVERSIZED"
  | "MALFORMED"
  | "UNSUPPORTED_VERSION"
  | "INVALID_SCHEMA";

export interface SharedTemplateParseResult {
  template: SharedTemplate | null;
  error: string | null;
  errorCode: SharedTemplateErrorCode | null;
}

function encodeUtf8Base64(json: string): string {
  try {
    return btoa(json);
  } catch {
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
}

function decodeUtf8Base64(encoded: string): string {
  const normalized = encoded
    .trim()
    .replace(/\s+/g, "+")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binary = atob(normalized);
  try {
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return binary;
  }
}

function normalizeOptionalAmount(value: unknown): {
  value?: string;
  valid: boolean;
} {
  if (value === undefined || value === null || value === "") {
    return { value: undefined, valid: true };
  }
  const str =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : null;
  if (str === null) {
    return { valid: false };
  }
  if (str === "") {
    return { value: undefined, valid: true };
  }
  if (!/^\d+(\.\d{1,7})?$/.test(str)) {
    return { valid: false };
  }
  const numeric = Number(str);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return { valid: false };
  }
  return { value: str, valid: true };
}

export function encodeSharedTemplate(template: SharedTemplate): string {
  const payload: SharedTemplate = {
    id: template.id,
    title: template.title,
    category: template.category,
    ...(template.amountMin ? { amountMin: template.amountMin } : {}),
    ...(template.amountMax ? { amountMax: template.amountMax } : {}),
    description: template.description,
    version: template.version ?? SHARED_TEMPLATE_VERSION,
  };
  return encodeURIComponent(encodeUtf8Base64(JSON.stringify(payload)));
}

export function parseSharedTemplateParam(
  rawParam: string | null | undefined,
  maxDescBytes: number = MAX_TEMPLATE_DESCRIPTION_BYTES,
): SharedTemplateParseResult {
  if (!rawParam || !rawParam.trim()) {
    return { template: null, error: null, errorCode: null };
  }

  if (rawParam.length > MAX_SHARED_TEMPLATE_PARAM_LENGTH) {
    return {
      template: null,
      error: "Shared template payload is too large and could not be loaded.",
      errorCode: "OVERSIZED",
    };
  }

  let uriDecoded = rawParam.trim();
  if (uriDecoded.includes("%")) {
    try {
      uriDecoded = decodeURIComponent(uriDecoded);
    } catch {
      return {
        template: null,
        error: "Shared template link is malformed and could not be decoded.",
        errorCode: "MALFORMED",
      };
    }
  }

  let jsonText: string;
  try {
    jsonText = decodeUtf8Base64(uriDecoded);
  } catch {
    return {
      template: null,
      error: "Shared template link is malformed and could not be decoded.",
      errorCode: "MALFORMED",
    };
  }

  const jsonByteLength = new TextEncoder().encode(jsonText).length;
  if (jsonByteLength > MAX_SHARED_TEMPLATE_JSON_BYTES) {
    return {
      template: null,
      error: "Shared template payload is too large and could not be loaded.",
      errorCode: "OVERSIZED",
    };
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(jsonText);
  } catch {
    return {
      template: null,
      error: "Shared template link contains invalid JSON data.",
      errorCode: "MALFORMED",
    };
  }

  if (
    typeof parsedUnknown !== "object" ||
    parsedUnknown === null ||
    Array.isArray(parsedUnknown)
  ) {
    return {
      template: null,
      error: "Shared template payload has an invalid format.",
      errorCode: "INVALID_SCHEMA",
    };
  }

  const record = parsedUnknown as Record<string, unknown>;

  if (record.version !== undefined) {
    if (
      typeof record.version !== "number" ||
      !Number.isInteger(record.version) ||
      record.version !== SHARED_TEMPLATE_VERSION
    ) {
      return {
        template: null,
        error: `Unsupported shared template version (${String(record.version)}).`,
        errorCode: "UNSUPPORTED_VERSION",
      };
    }
  }

  if (typeof record.title !== "string" || !record.title.trim()) {
    return {
      template: null,
      error: "Shared template is missing a valid job title.",
      errorCode: "INVALID_SCHEMA",
    };
  }

  const title = record.title.trim();
  if (new TextEncoder().encode(title).length > MAX_TEMPLATE_TITLE_BYTES) {
    return {
      template: null,
      error: `Shared template title exceeds the ${MAX_TEMPLATE_TITLE_BYTES}-byte limit.`,
      errorCode: "OVERSIZED",
    };
  }

  if (typeof record.description !== "string" || !record.description.trim()) {
    return {
      template: null,
      error: "Shared template is missing a valid job description.",
      errorCode: "INVALID_SCHEMA",
    };
  }

  const description = record.description.trim();
  const effectiveMaxDesc =
    Number.isFinite(maxDescBytes) && maxDescBytes > 0
      ? maxDescBytes
      : MAX_TEMPLATE_DESCRIPTION_BYTES;
  if (new TextEncoder().encode(description).length > effectiveMaxDesc) {
    return {
      template: null,
      error: `Shared template description exceeds the ${effectiveMaxDesc}-byte limit.`,
      errorCode: "OVERSIZED",
    };
  }

  if (typeof record.category !== "string" || !record.category.trim()) {
    return {
      template: null,
      error: "Shared template is missing a valid category.",
      errorCode: "INVALID_SCHEMA",
    };
  }

  const category = record.category.trim();
  if (category.length > MAX_TEMPLATE_CATEGORY_LENGTH) {
    return {
      template: null,
      error: "Shared template category exceeds the maximum length.",
      errorCode: "INVALID_SCHEMA",
    };
  }

  let id = "shared-template";
  if (record.id !== undefined) {
    if (
      typeof record.id !== "string" ||
      !record.id.trim() ||
      record.id.trim().length > MAX_TEMPLATE_ID_LENGTH
    ) {
      return {
        template: null,
        error: "Shared template has an invalid identifier.",
        errorCode: "INVALID_SCHEMA",
      };
    }
    id = record.id.trim();
  }

  const minResult = normalizeOptionalAmount(record.amountMin);
  const maxResult = normalizeOptionalAmount(record.amountMax);
  if (!minResult.valid || !maxResult.valid) {
    return {
      template: null,
      error: "Shared template contains an invalid amount range.",
      errorCode: "INVALID_SCHEMA",
    };
  }

  if (
    minResult.value !== undefined &&
    maxResult.value !== undefined &&
    Number(minResult.value) > Number(maxResult.value)
  ) {
    return {
      template: null,
      error: "Shared template minimum amount cannot exceed maximum amount.",
      errorCode: "INVALID_SCHEMA",
    };
  }

  return {
    template: {
      id,
      title,
      category,
      ...(minResult.value !== undefined ? { amountMin: minResult.value } : {}),
      ...(maxResult.value !== undefined ? { amountMax: maxResult.value } : {}),
      description,
      version: SHARED_TEMPLATE_VERSION,
    },
    error: null,
    errorCode: null,
  };
}
