#!/usr/bin/env python3
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = [ROOT / "docs", ROOT / ".github"]

HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")


def iter_markdown_files():
    for target in TARGETS:
        if not target.exists():
            continue
        for path in sorted(target.rglob("*.md")):
            if "node_modules" in path.parts:
                continue
            yield path


def check_file(path: Path):
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    headings = []
    in_fence = False
    for line_no, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        match = HEADING_RE.match(line)
        if match:
            headings.append((line_no, len(match.group(1)), match.group(2).strip()))

    if not headings:
        return None

    errors = []
    if sum(1 for _, level, _ in headings if level == 1) != 1:
        errors.append(f"expected exactly one H1, found {sum(1 for _, level, _ in headings if level == 1)}")

    previous_level = None
    for line_no, level, text in headings:
        if previous_level is not None and level > previous_level + 1:
            errors.append(f"skipped heading level at line {line_no}: H{previous_level} -> H{level} ({text})")
        previous_level = level

    return errors


def main():
    failures = []
    for path in iter_markdown_files():
        errors = check_file(path)
        if errors:
            failures.append((path.relative_to(ROOT), errors))

    if failures:
        print("Heading hierarchy issues detected:")
        for path, errors in failures:
            print(f"- {path}")
            for error in errors:
                print(f"  - {error}")
        sys.exit(1)

    print("Heading hierarchy check passed for docs and issue templates.")


if __name__ == "__main__":
    main()
