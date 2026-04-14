"""
ios_ci_review.py

Run the iOS agent team as a CI/CD step to review PRs automatically.
Based on: https://github.com/anthropics/claude-agent-sdk-demos

Usage:
    pip install claude-agent-sdk
    python ios_ci_review.py --path ./Sources
"""

import asyncio
import argparse
from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition


AGENTS = {
    "swiftui-reviewer": AgentDefinition(
        description="Reviews SwiftUI code for best practices.",
        prompt=(
            "Review SwiftUI files for: correct property wrappers, view composition, "
            "performance (stable ForEach identity, lazy containers), accessibility "
            "(Button over onTapGesture), animation correctness. "
            "Return a concise list of issues with file:line references."
        ),
        tools=["Read", "Glob", "Grep"],
        model="sonnet",
    ),
    "concurrency-reviewer": AgentDefinition(
        description="Reviews Swift concurrency patterns for safety.",
        prompt=(
            "Review Swift files for: data race safety, proper actor isolation, "
            "justified @MainActor usage, structured concurrency patterns, "
            "Sendable conformance. Return issues with file:line references."
        ),
        tools=["Read", "Glob", "Grep"],
        model="sonnet",
    ),
    "test-reviewer": AgentDefinition(
        description="Reviews Swift test quality and patterns.",
        prompt=(
            "Review test files for: #require vs #expect usage, parameterized tests, "
            "parallel safety, async handling, proper imports. "
            "Return issues with file:line references."
        ),
        tools=["Read", "Glob", "Grep"],
        model="haiku",  # Tests review is simpler, use cheaper model
    ),
}


async def main(path: str):
    prompt = f"""
You coordinate three specialist reviewers. Delegate to each one:
1. swiftui-reviewer: review SwiftUI views in {path}
2. concurrency-reviewer: review concurrency in {path}
3. test-reviewer: review tests in {path}

Synthesize findings into a markdown report with:
- Summary (1 paragraph)
- Critical issues (must fix before merge)
- Warnings (should fix)
- Suggestions (nice to have)

Be concise. This runs in CI so keep output under 200 lines.
"""

    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Glob", "Grep", "Agent"],
        agents=AGENTS,
        model="claude-sonnet-4-6",
    )

    async for message in query(prompt=prompt, options=options):
        if hasattr(message, "result") and message.result:
            print(message.result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="iOS Agent Team CI Review")
    parser.add_argument("--path", default=".", help="Path to review")
    args = parser.parse_args()
    asyncio.run(main(args.path))
