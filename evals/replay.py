#!/usr/bin/env python3
"""Replay the golden prompts against agent-team variants and report routing + token usage.

Each variant is a git ref (or WORKTREE for uncommitted files) whose `.claude/` and
`CLAUDE.md.snippet` are extracted into a throwaway project. For every prompt the script runs
`claude -p`, stops the process at the first subagent spawn, and records which agent the main
session picked. That keeps the run cheap: the delegated task itself never executes.

    python3 evals/replay.py run --variant baseline=origin/main --variant tuned=WORKTREE --limit 3
    python3 evals/replay.py report evals/results/<file>.jsonl
"""

import argparse
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
from collections import defaultdict
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PROMPTS = REPOSITORY_ROOT / "evals" / "golden" / "prompts.jsonl"
RESULTS_DIRECTORY = REPOSITORY_ROOT / "evals" / "results"
SPAWN_TOOL_NAMES = {"Agent", "Task"}
SINGLE_DOMAIN_ROUTES = {"swiftui", "concurrency", "testing", "review"}
LEAD_AGENT = "ios-lead"
UNNECESSARY_LEAD_THRESHOLD = 0.20
ROUTE_BY_AGENT = {
    "ios-lead": "cross-cutting",
    "swiftui-expert": "swiftui",
    "swift-concurrency-expert": "concurrency",
    "swift-testing-expert": "testing",
    "ios-reviewer": "review",
}
PACKAGE_STUB = (
    "// swift-tools-version: 6.0\n"
    "import PackageDescription\n"
    'let package = Package(name: "Fixture", platforms: [.iOS(.v17)], targets: [.target(name: "Fixture")])\n'
)


def prepare_fixture(reference: str) -> Path:
    fixture = Path(tempfile.mkdtemp(prefix="ios-agent-replay-"))
    if reference == "WORKTREE":
        shutil.copytree(REPOSITORY_ROOT / ".claude", fixture / ".claude")
        shutil.copy(REPOSITORY_ROOT / "CLAUDE.md.snippet", fixture / "CLAUDE.md")
    else:
        archive = subprocess.run(
            ["git", "archive", reference, ".claude", "CLAUDE.md.snippet"],
            cwd=REPOSITORY_ROOT,
            check=True,
            capture_output=True,
        )
        subprocess.run(["tar", "-x", "-C", str(fixture)], input=archive.stdout, check=True)
        (fixture / "CLAUDE.md.snippet").rename(fixture / "CLAUDE.md")
    (fixture / "Package.swift").write_text(PACKAGE_STUB)
    return fixture


def run_prompt(prompt: str, fixture: Path, model: str, budget: float, timeout: float, isFork: bool) -> dict:
    command = [
        "claude", "-p", prompt,
        "--output-format", "stream-json", "--verbose",
        "--no-session-persistence",
        "--setting-sources", "project",
        "--model", model,
        "--max-budget-usd", str(budget),
    ]
    environment = dict(os.environ)
    if isFork:
        environment["CLAUDE_CODE_FORK_SUBAGENT"] = "1"
    process = subprocess.Popen(
        command, cwd=fixture, env=environment, text=True,
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )
    watchdog = threading.Timer(timeout, process.kill)
    watchdog.start()
    started = time.monotonic()
    firstAgent = None
    endedReason = "killed"
    toolsBeforeSpawn: list[str] = []
    usageByMessage: dict[str, dict] = {}
    try:
        for line in process.stdout:
            event = _parse_event(line)
            if event is not None and event.get("type") == "result":
                endedReason = "completed"
                break
            if event is None or event.get("type") != "assistant":
                continue
            message = event.get("message", {})
            if message.get("id"):
                usageByMessage[message["id"]] = {"model": message.get("model"), **(message.get("usage") or {})}
            firstAgent = _first_spawned_agent(message)
            if firstAgent:
                endedReason = "spawn"
                break
            toolsBeforeSpawn += [
                block["name"] for block in message.get("content", []) if block.get("type") == "tool_use"
            ]
    finally:
        watchdog.cancel()
        process.kill()
        process.wait()
    return {
        "first_agent": firstAgent,
        "ended_reason": endedReason,
        "tools_before_spawn": toolsBeforeSpawn,
        "elapsed_seconds": round(time.monotonic() - started, 1),
        "tokens_by_model": _sum_tokens(usageByMessage.values()),
    }


def _parse_event(line: str) -> dict | None:
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        return None


def _first_spawned_agent(message: dict) -> str | None:
    for block in message.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") in SPAWN_TOOL_NAMES:
            return (block.get("input") or {}).get("subagent_type") or "general-purpose"
    return None


def _sum_tokens(usages) -> dict:
    totals: dict[str, dict] = defaultdict(lambda: defaultdict(int))
    for usage in usages:
        bucket = totals[usage.get("model") or "unknown"]
        for key in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"):
            bucket[key] += usage.get(key) or 0
    return {model: dict(counts) for model, counts in totals.items()}


def command_run(arguments: argparse.Namespace) -> None:
    prompts = [json.loads(line) for line in Path(arguments.prompts).read_text().splitlines() if line.strip()]
    if arguments.ids:
        prompts = [row for row in prompts if row["id"] in arguments.ids]
    if arguments.limit:
        prompts = prompts[: arguments.limit]
    RESULTS_DIRECTORY.mkdir(parents=True, exist_ok=True)
    outputPath = RESULTS_DIRECTORY / f"replay-{time.strftime('%Y%m%d-%H%M%S')}.jsonl"
    with outputPath.open("w") as output:
        for variantSpec in arguments.variant:
            name, _, reference = variantSpec.partition("=")
            fixture = prepare_fixture(reference or "WORKTREE")
            try:
                for row in prompts:
                    for repeat in range(arguments.repeats):
                        outcome = run_prompt(
                            row["prompt"], fixture, arguments.model, arguments.budget, arguments.timeout,
                            arguments.fork,
                        )
                        record = {"variant": name, "id": row["id"], "repeat": repeat, "expected": row["expected"],
                                  "ambiguous": row["ambiguous"], **outcome}
                        output.write(json.dumps(record, ensure_ascii=False) + "\n")
                        output.flush()
                        print(f"{name} {row['id']}#{repeat} expected={row['expected']} -> "
                              f"{outcome['first_agent']} ({outcome['ended_reason']})")
            finally:
                shutil.rmtree(fixture, ignore_errors=True)
    print(f"\nResults: {outputPath}")


def command_report(arguments: argparse.Namespace) -> None:
    records = [json.loads(line) for line in Path(arguments.results).read_text().splitlines() if line.strip()]
    byVariant: dict[str, list] = defaultdict(list)
    for record in records:
        byVariant[record["variant"]].append(record)
    for name, rows in byVariant.items():
        singleDomain = [row for row in rows if row["expected"] in SINGLE_DOMAIN_ROUTES]
        crossCutting = [row for row in rows if row["expected"] == "cross-cutting"]
        unnecessaryLead = [row for row in singleDomain if row["first_agent"] == LEAD_AGENT]
        leadRate = len(unnecessaryLead) / len(singleDomain) if singleDomain else 0.0
        leadCoverage = sum(row["first_agent"] == LEAD_AGENT for row in crossCutting)
        correct = sum(ROUTE_BY_AGENT.get(row["first_agent"]) == row["expected"] for row in singleDomain)
        print(f"== {name} ({len(rows)} runs)")
        print(f"  single-domain routed to the right specialist: {correct}/{len(singleDomain)}")
        print(f"  unnecessary ios-lead (Opus) spawns: {len(unnecessaryLead)}/{len(singleDomain)} = {leadRate:.0%}"
              f" (build JEV router only if > {UNNECESSARY_LEAD_THRESHOLD:.0%})")
        print(f"  cross-cutting routed to ios-lead: {leadCoverage}/{len(crossCutting)}")
        reasons = defaultdict(int)
        for row in rows:
            reasons[row["ended_reason"]] += 1
        print(f"  ended: {dict(reasons)} (completed = answered without spawning; killed = timeout/error)")
        print(f"  tokens by model: {_report_tokens(rows)}")


def _report_tokens(rows: list) -> dict:
    totals: dict[str, int] = defaultdict(int)
    for row in rows:
        for model, counts in row["tokens_by_model"].items():
            totals[model] += sum(counts.values())
    return dict(totals)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    subcommands = parser.add_subparsers(dest="command", required=True)
    run = subcommands.add_parser("run")
    run.add_argument("--variant", action="append", required=True, help="name=gitref or name=WORKTREE")
    run.add_argument("--prompts", default=str(DEFAULT_PROMPTS))
    run.add_argument("--ids", nargs="*")
    run.add_argument("--limit", type=int)
    run.add_argument("--repeats", type=int, default=3, help="runs per prompt; the main session is nondeterministic")
    run.add_argument("--model", default="sonnet", help="main-session model")
    run.add_argument("--budget", type=float, default=0.50, help="per-prompt USD cap")
    run.add_argument("--timeout", type=float, default=120)
    run.add_argument("--fork", action="store_true", help="set CLAUDE_CODE_FORK_SUBAGENT=1")
    run.set_defaults(handler=command_run)
    report = subcommands.add_parser("report")
    report.add_argument("results")
    report.set_defaults(handler=command_report)
    return parser


if __name__ == "__main__":
    parsedArguments = build_parser().parse_args()
    parsedArguments.handler(parsedArguments)
