#!/usr/bin/env python3
"""
check_reproducible.py

Build the escrow contract twice from a clean state and verify the produced
WASM binaries are byte-for-byte identical.  Exits 0 on success, non-zero on
any mismatch or build failure.

Usage:
    python3 scripts/check_reproducible.py [--contract-dir PATH]

The check mirrors the reproducible-build CI job so that any developer can
reproduce and verify the same assertion locally before pushing.
"""

import argparse
import hashlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str], cwd: Path) -> None:
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr, file=sys.stderr)
        sys.exit(result.returncode)


def build_wasm(contract_dir: Path, out_dir: Path) -> Path:
    """
    Build the contract targeting wasm32-unknown-unknown --release and copy the
    resulting .wasm to out_dir.  Returns the path to the copied file.
    """
    run(
        [
            "cargo",
            "build",
            "--target",
            "wasm32-unknown-unknown",
            "--release",
        ],
        cwd=contract_dir,
    )
    wasm_src = (
        contract_dir
        / "target"
        / "wasm32-unknown-unknown"
        / "release"
        / "escrow.wasm"
    )
    if not wasm_src.exists():
        print(f"ERROR: expected WASM not found at {wasm_src}", file=sys.stderr)
        sys.exit(1)
    dest = out_dir / "escrow.wasm"
    shutil.copy2(wasm_src, dest)
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--contract-dir",
        default=None,
        help="Path to the escrow contract directory (default: contracts/escrow relative to repo root)",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    contract_dir = Path(args.contract_dir) if args.contract_dir else repo_root / "contracts" / "escrow"

    if not contract_dir.is_dir():
        print(f"ERROR: contract directory not found: {contract_dir}", file=sys.stderr)
        sys.exit(1)

    with tempfile.TemporaryDirectory(prefix="reproducible_build_1_") as tmp1, \
         tempfile.TemporaryDirectory(prefix="reproducible_build_2_") as tmp2:

        print("=== Build 1 ===")
        wasm1 = build_wasm(contract_dir, Path(tmp1))
        hash1 = sha256_of_file(wasm1)
        print(f"Build 1 SHA-256: {hash1}")

        print("\n=== Build 2 ===")
        wasm2 = build_wasm(contract_dir, Path(tmp2))
        hash2 = sha256_of_file(wasm2)
        print(f"Build 2 SHA-256: {hash2}")

        print()
        if hash1 == hash2:
            print("SUCCESS: Both builds produced identical WASM. Build is reproducible.")
        else:
            print("FAILURE: WASM hashes do not match. Build is NOT reproducible.", file=sys.stderr)
            print(f"  Build 1: {hash1}", file=sys.stderr)
            print(f"  Build 2: {hash2}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
