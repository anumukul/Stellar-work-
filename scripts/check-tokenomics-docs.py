#!/usr/bin/env python3
"""Tokenomics documentation consistency check.

Asserts that the headline economic constants documented in docs/TOKENOMICS.md
match the actual source of truth:

* contracts/escrow/src/lib.rs            (the deployed fee logic)
* frontend/lib/transactions.ts           (the client-side fee mirror)
* frontend/app/fee-calculator/page.tsx   (the public fee estimator)

Run from anywhere:

    python3 scripts/check-tokenomics-docs.py

Exit code 0 = docs and code agree. Non-zero = drift detected; the output
states which constant disagrees.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / "docs" / "TOKENOMICS.md"
LIB_RS = ROOT / "contracts" / "escrow" / "src" / "lib.rs"
TXN_TS = ROOT / "frontend" / "lib" / "transactions.ts"
FEE_PAGE = ROOT / "frontend" / "app" / "fee-calculator" / "page.tsx"


def read(path: Path) -> str:
    if not path.exists():
        sys.exit(f"FATAL: expected file not found: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def rust_const(name: str, text: str) -> int:
    match = re.search(rf"const {name}: (?:i128|u32) = ([0-9_]+);", text)
    if not match:
        sys.exit(f"FATAL: const {name} not found in {LIB_RS.relative_to(ROOT)}")
    return int(match.group(1).replace("_", ""))


def ts_const(name: str, text: str) -> int:
    match = re.search(rf"const {name} = ([0-9_]+)n;", text)
    if not match:
        sys.exit(f"FATAL: const {name} not found in {TXN_TS.relative_to(ROOT)}")
    return int(match.group(1).replace("_", ""))


def main() -> None:
    doc = read(DOC)
    lib = read(LIB_RS)
    txn = read(TXN_TS)
    page = read(FEE_PAGE)
    errors: list[str] = []

    def doc_has(needle: str, what: str) -> None:
        if needle not in doc:
            errors.append(f"docs/TOKENOMICS.md does not mention {what}: {needle!r}")

    # --- platform fee defaults and caps --------------------------------------
    default_fee = rust_const("DEFAULT_FEE_BPS", lib)       # 250
    max_fee = rust_const("MAX_FEE_BPS", lib)                # 1,000
    max_cfg = rust_const("MAX_FEE_BPS_CONFIG", lib)        # 10,000
    tiers_cap = rust_const("MAX_FEE_TIERS", lib)           # 10

    doc_has(f"**{default_fee} bps (2.5%)**", "default platform fee")
    doc_has(f"`update_fee`: 0\u2013{max_fee:,} bps (0\u2013{max_fee // 100}%)", "update_fee bound")
    doc_has(f"`update_fee_bps`: 1\u2013{max_cfg:,} bps", "update_fee_bps bound")
    doc_has(
        f"`MAX_FEE_TIERS = {tiers_cap}`",
        "fee tier cap",
    )

    # --- dispute / oracle / burn / referral defaults --------------------------
    dispute = rust_const("DEFAULT_DISPUTE_FEE", lib)      # 50,000,000 stroops
    oracle = rust_const("DEFAULT_ORACLE_FEE", lib)        # 20,000,000 stroops
    burn_default = rust_const("DEFAULT_BURN_BPS", lib)    # 0
    referral_bps = rust_const("REFERRAL_BPS", lib)        # 50

    if dispute % 10_000_000 == 0:
        doc_has(f"**{dispute // 10_000_000} XLM**", "default dispute deposit")
    if oracle % 10_000_000 == 0:
        doc_has(f"**{oracle // 10_000_000} XLM**", "default oracle fee")
    if burn_default == 0:
        doc_has("0% by default", "burn default")
    doc_has(f"{referral_bps / 100:.1f}%", "referral bonus rate")

    # --- frontend mirrors -------------------------------------------------------
    if ts_const("FEE_BPS", txn) != default_fee:
        errors.append(
            "frontend/lib/transactions.ts FEE_BPS does not mirror DEFAULT_FEE_BPS "
            f"({ts_const('FEE_BPS', txn)} vs {default_fee})"
        )
    page_match = re.search(r"PLATFORM_FEE_PERCENT = ([0-9.]+);", page)
    if not page_match or abs(float(page_match.group(1)) - default_fee / 100.0) > 1e-9:
        errors.append(
            "frontend fee-calculator PLATFORM_FEE_PERCENT does not match the fee "
            "rate documented in docs/TOKENOMICS.md"
        )

    # --- named contract surfaces cited in the doc -------------------------------
    cited_functions = (
        "approve_work",
        "withdraw_fees",
        "calculate_fee_for_amount",
        "update_fee_tier",
        "set_fee_exemption",
        "raise_dispute",
        "resolve_dispute",
        "submit_verdict",
        "update_burn_percentage",
        "execute_burn",
        "withdraw_referral_earnings",
    )
    for fn in cited_functions:
        if not re.search(rf"(?:pub )?fn {fn}\(", lib):
            errors.append(f"doc cites contract function `{fn}` which no longer exists in lib.rs")
        if f"`{fn}`" not in doc and f"{fn}(" not in doc:
            errors.append(f"docs/TOKENOMICS.md no longer cites `{fn}`")

    if errors:
        for err in errors:
            print(f"FAIL: {err}")
        sys.exit(1)

    print(
        "OK: docs/TOKENOMICS.md is consistent with contracts/escrow/src/lib.rs "
        "and frontend fee mirrors "
        f"(fee={default_fee} bps, caps={max_fee}/{max_cfg} bps, "
        f"tiers<= {tiers_cap}, dispute={dispute} stroops, oracle={oracle} stroops, "
        f"referral={referral_bps} bps, burn_default={burn_default} bps)."
    )


if __name__ == "__main__":
    main()
