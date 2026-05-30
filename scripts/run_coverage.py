from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def clean_output(output: str) -> str:
    return ANSI_RE.sub("", output)


def python_executable() -> str:
    candidates = [
        ROOT / "backend" / ".venv" / "bin" / "python",
        ROOT / ".venv" / "bin" / "python",
        ROOT / "venv" / "bin" / "python",
        ROOT / "backend" / "venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return sys.executable


def run_section(title: str, cmd: list[str]) -> tuple[int, str]:
    line = "=" * 72
    print(f"\n{line}\n{title}\n{line}", flush=True)
    result = subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    print(result.stdout, end="", flush=True)
    return result.returncode, result.stdout


def extract_backend_coverage(output: str) -> str | None:
    output = clean_output(output)
    match = re.search(r"^TOTAL\s+\d+\s+\d+\s+(\d+%)", output, re.MULTILINE)
    return match.group(1) if match else None


def extract_frontend_coverage(output: str) -> str | None:
    output = clean_output(output)
    summary_match = re.search(r"^Lines\s*:\s*([\d.]+%)", output, re.MULTILINE)
    if summary_match:
        return summary_match.group(1)

    # Fallback for compact/table-only Vitest output:
    # All files | 74.74 | 57.94 | 80.37 | 78.85 |
    table_match = re.search(
        r"^All files\s*\|\s*[\d.]+\s*\|\s*[\d.]+\s*\|\s*[\d.]+\s*\|\s*([\d.]+)",
        output,
        re.MULTILINE,
    )
    if table_match:
        return f"{table_match.group(1)}%"
    return None


def main() -> int:
    checks = [
        (
            "Backend tests coverage",
            [python_executable(), "backend/scripts/run_tests_with_coverage.py"],
            extract_backend_coverage,
            "Backend coverage",
        ),
        (
            "Frontend tests coverage",
            ["npm", "run", "test:coverage", "--prefix", "frontend"],
            extract_frontend_coverage,
            "Frontend coverage",
        ),
    ]

    failed = []
    summary = []
    for title, cmd, extractor, label in checks:
        code, output = run_section(title, cmd)
        if code != 0:
            failed.append((title, code))
        summary.append((label, extractor(output)))

    print("\n" + "=" * 72)
    print("Coverage summary")
    print("=" * 72)
    for label, value in summary:
        print(f"{label}: {value or 'not found'}")

    if failed:
        print("\nCoverage checks failed:", flush=True)
        for title, code in failed:
            print(f"- {title}: exit code {code}")
        return 1

    print("\nAll backend and frontend coverage checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
