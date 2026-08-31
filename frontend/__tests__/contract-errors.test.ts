/**
 * Contract error catalogue — DOC-43 (#761).
 *
 * The load-bearing test here is the drift guard at the bottom: it parses the
 * Rust enum and asserts the catalogue agrees, code for code. That is the check
 * that would have caught the bug this issue exists to fix — the previous map
 * reported code 1 as "Not authorized" and code 2 as "Job not found" when the
 * contract defines exactly the reverse, so a user denied by an authorisation
 * check was told the job did not exist.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CONTRACT_ERRORS,
  CONTRACT_ERROR_CODES,
  actionForContractCode,
  contractErrorFor,
  describeContractError,
  extractContractErrorCode,
  messageForContractCode,
} from "@/lib/contract-errors";
import { parseContractError } from "@/lib/stellar";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTRACT_SRC = join(REPO_ROOT, "contracts", "escrow", "src", "lib.rs");
const DOC = join(REPO_ROOT, "docs", "contract-error-messages.md");

/** Parse `Variant = N,` pairs out of the Rust `Error` enum. */
function rustErrorVariants(): Map<number, string> {
  const source = readFileSync(CONTRACT_SRC, "utf-8");
  const start = source.indexOf("pub enum Error {");
  const end = source.indexOf("}", start);
  const body = source.slice(start, end);

  const variants = new Map<number, string>();
  for (const match of body.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*=\s*(\d+)\s*,/gm)) {
    variants.set(Number(match[2]), match[1]);
  }
  return variants;
}

describe("the catalogue", () => {
  it("is not empty", () => {
    expect(CONTRACT_ERROR_CODES.length).toBeGreaterThan(0);
  });

  it("is keyed by each entry's own code", () => {
    // A mismatch means a lookup returns the spec for a different failure.
    for (const [key, entry] of Object.entries(CONTRACT_ERRORS)) {
      expect(entry.code).toBe(Number(key));
    }
  });

  it("lists codes in ascending order", () => {
    expect([...CONTRACT_ERROR_CODES].sort((a, b) => a - b)).toEqual(CONTRACT_ERROR_CODES);
  });

  it("gives every entry a message and an action", () => {
    for (const code of CONTRACT_ERROR_CODES) {
      const entry = CONTRACT_ERRORS[code];
      expect(entry.message.length, `code ${code} has no message`).toBeGreaterThan(0);
      expect(entry.action.length, `code ${code} has no action`).toBeGreaterThan(0);
      expect(entry.trigger.length, `code ${code} has no trigger`).toBeGreaterThan(0);
    }
  });

  it("never shows the user a raw error code", () => {
    // The point of the catalogue: a discriminant is not a message.
    for (const code of CONTRACT_ERROR_CODES) {
      expect(CONTRACT_ERRORS[code].message, `code ${code}`).not.toMatch(/#\d+|Error\(Contract/);
    }
  });

  it("writes messages as complete sentences", () => {
    for (const code of CONTRACT_ERROR_CODES) {
      const { message } = CONTRACT_ERRORS[code];
      expect(message[0], `code ${code} is not capitalised`).toBe(message[0].toUpperCase());
      expect(message, `code ${code} has no full stop`).toMatch(/[.!?]$/);
    }
  });

  it("gives each code a distinct message", () => {
    const messages = CONTRACT_ERROR_CODES.map((c) => CONTRACT_ERRORS[c].message);

    // Two codes with one message are two codes the UI cannot tell apart.
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("uses each Rust variant name exactly once", () => {
    const variants = CONTRACT_ERROR_CODES.map((c) => CONTRACT_ERRORS[c].variant);
    expect(new Set(variants).size).toBe(variants.length);
  });
});

describe("extractContractErrorCode", () => {
  it("reads a bare contract error", () => {
    expect(extractContractErrorCode(new Error("Error(Contract, #7)"))).toBe(7);
  });

  it("reads one nested in a HostError string", () => {
    const raw =
      "HostError: Error(Contract, #15) \n Event log (newest first): ... some XDR ...";
    expect(extractContractErrorCode(new Error(raw))).toBe(15);
  });

  it("is case- and whitespace-tolerant", () => {
    expect(extractContractErrorCode("error( contract , #3 )")).toBe(3);
    expect(extractContractErrorCode("ERROR(CONTRACT, #3)")).toBe(3);
  });

  it("reads a thrown string", () => {
    expect(extractContractErrorCode("Error(Contract, #2)")).toBe(2);
  });

  it("returns null for a non-contract error", () => {
    // So a caller falls through to network or wallet handling rather than
    // mislabelling a dropped connection as a contract failure.
    expect(extractContractErrorCode(new Error("fetch failed"))).toBeNull();
    expect(extractContractErrorCode(new Error("Error(WasmVm, #3)"))).toBeNull();
  });

  it("returns null for nullish input", () => {
    expect(extractContractErrorCode(null)).toBeNull();
    expect(extractContractErrorCode(undefined)).toBeNull();
  });
});

describe("lookups", () => {
  it("returns the spec for a known code", () => {
    expect(contractErrorFor(1)?.variant).toBe("JobNotFound");
  });

  it("returns undefined for an unknown code", () => {
    expect(contractErrorFor(9999)).toBeUndefined();
  });

  it("falls back to a usable sentence for an unknown code", () => {
    // The contract may be newer than the frontend; a user must never see a
    // bare discriminant.
    const message = messageForContractCode(9999);

    expect(message).not.toMatch(/9999/);
    expect(message.length).toBeGreaterThan(0);
  });

  it("falls back to a usable action for an unknown code", () => {
    expect(actionForContractCode(9999).length).toBeGreaterThan(0);
  });
});

describe("describeContractError", () => {
  it("describes a contract error", () => {
    const described = describeContractError(new Error("Error(Contract, #5)"));

    expect(described).toEqual({
      code: 5,
      message: CONTRACT_ERRORS[5].message,
      action: CONTRACT_ERRORS[5].action,
    });
  });

  it("returns null for anything else", () => {
    expect(describeContractError(new Error("network unreachable"))).toBeNull();
  });
});

describe("the codes that were previously wrong (#761)", () => {
  it("maps code 1 to job-not-found, not authorisation", () => {
    // The exact inversion this issue exists to fix.
    expect(CONTRACT_ERRORS[1].variant).toBe("JobNotFound");
    expect(messageForContractCode(1).toLowerCase()).toContain("could not be found");
  });

  it("maps code 2 to authorisation, not job-not-found", () => {
    expect(CONTRACT_ERRORS[2].variant).toBe("Unauthorized");
    expect(messageForContractCode(2).toLowerCase()).toContain("permission");
  });

  it("does not describe code 4 as an amount problem", () => {
    // The old map called this "Job amount must be greater than zero"; the
    // contract defines it as InsufficientFunds, and the real amount error is 11.
    expect(CONTRACT_ERRORS[4].variant).toBe("InsufficientFunds");
    expect(CONTRACT_ERRORS[11].variant).toBe("InvalidAmount");
  });

  it("does not describe code 5 as a token problem", () => {
    expect(CONTRACT_ERRORS[5].variant).toBe("JobAlreadyAccepted");
    expect(CONTRACT_ERRORS[8].variant).toBe("TokenNotAllowed");
  });
});

describe("parseContractError integration", () => {
  it("uses the catalogue for a contract error", () => {
    const message = parseContractError(new Error("Error(Contract, #2)"));

    expect(message).toContain(CONTRACT_ERRORS[2].message);
    expect(message).toContain(CONTRACT_ERRORS[2].action);
  });

  it("still handles a job-not-found error correctly", () => {
    expect(parseContractError(new Error("Error(Contract, #1)"))).toContain("could not be found");
  });

  it("leaves wallet errors to the wallet branch", () => {
    expect(parseContractError(new Error("User declined the request"))).toBe(
      "Transaction was cancelled.",
    );
  });

  it("leaves network errors to the network branch", () => {
    expect(parseContractError(new Error("Request timed out"))).toContain("timed out");
  });

  it("still special-cases an insufficient balance", () => {
    // Code 10 on the SAC means a balance problem, not the escrow contract's
    // AlreadyInitialized; the balance branch runs first and must keep doing so.
    expect(parseContractError(new Error("insufficient balance"), "12.5")).toContain("12.5");
  });

  it("never returns an empty message", () => {
    for (const input of [new Error(""), "", null, undefined, 42]) {
      expect(parseContractError(input).length, `input ${String(input)}`).toBeGreaterThan(0);
    }
  });
});

describe("drift guard: the catalogue matches contracts/escrow/src/lib.rs", () => {
  const variants = rustErrorVariants();

  it("parses the Rust enum", () => {
    // A guard that silently parsed nothing would pass forever.
    expect(variants.size).toBeGreaterThan(0);
  });

  it("covers every variant the contract defines", () => {
    for (const [code, variant] of variants) {
      expect(CONTRACT_ERRORS[code], `contract error ${variant} = ${code} is uncatalogued`).toBeDefined();
    }
  });

  it("defines no code the contract does not", () => {
    for (const code of CONTRACT_ERROR_CODES) {
      expect(variants.has(code), `catalogue has code ${code}, the contract does not`).toBe(true);
    }
  });

  it("pairs every code with the right variant name", () => {
    // The check that catches a swap: matching counts prove nothing if the
    // names are transposed.
    for (const [code, variant] of variants) {
      expect(CONTRACT_ERRORS[code].variant, `code ${code} is mislabelled`).toBe(variant);
    }
  });
});

describe("drift guard: docs/contract-error-messages.md", () => {
  const doc = readFileSync(DOC, "utf-8");

  /** Table rows look like `| 1 | \`JobNotFound\` | … |`. */
  const documented = [...doc.matchAll(/^\|\s*(\d+)\s*\|\s*`([A-Za-z0-9]+)`\s*\|/gm)].map((m) => ({
    code: Number(m[1]),
    variant: m[2],
  }));

  it("documents every code", () => {
    const codes = new Set(documented.map((row) => row.code));
    for (const code of CONTRACT_ERROR_CODES) {
      expect(codes.has(code), `code ${code} is not in the documented table`).toBe(true);
    }
  });

  it("documents no code the catalogue does not define", () => {
    expect(documented.length).toBeGreaterThan(0);
    for (const row of documented) {
      expect(CONTRACT_ERRORS[row.code], `documented code ${row.code} is undefined`).toBeDefined();
    }
  });

  it("names the same variant the catalogue does", () => {
    for (const row of documented) {
      expect(CONTRACT_ERRORS[row.code].variant, `code ${row.code} disagrees`).toBe(row.variant);
    }
  });

  it("quotes the message the catalogue actually returns", () => {
    for (const row of documented) {
      expect(doc, `code ${row.code} documents a stale message`).toContain(
        CONTRACT_ERRORS[row.code].message,
      );
    }
  });
});
