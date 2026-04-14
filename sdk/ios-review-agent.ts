/**
 * ios-review-agent.ts
 *
 * Programmatic usage of the iOS agent team via the Claude Agent SDK.
 * Use this as a starting point for CI/CD integration, PR review bots,
 * or custom tooling.
 *
 * Based on: https://github.com/anthropics/claude-agent-sdk-demos
 *
 * Usage:
 *   bun install @anthropic-ai/claude-agent-sdk
 *   bun run ios-review-agent.ts
 */

import { query, ClaudeAgentOptions, AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

// Define the iOS specialist agents programmatically
// These mirror the .claude/agents/*.md definitions but work in SDK context
const agents: Record<string, AgentDefinition> = {
  "swiftui-expert": {
    description:
      "SwiftUI specialist for building, reviewing, and improving SwiftUI views. Covers state management, view composition, performance, animations, accessibility, and navigation.",
    prompt: `You are a SwiftUI expert. Review code for:
- Correct property wrapper usage (@State must be private, @Binding only for child mutation)
- View composition (extract complex views, no side effects in body)
- Performance (stable ForEach identity, no AnyView in lists, lazy containers)
- Accessibility (Button over onTapGesture, @ScaledMetric, proper labels)
- Animation correctness (.animation with value parameter)
- No deprecated APIs
Provide prioritized, actionable feedback with code examples.`,
    tools: ["Read", "Glob", "Grep"],
    model: "sonnet",
  },

  "swift-concurrency-expert": {
    description:
      "Swift Concurrency specialist for async/await, actors, Sendable, and Swift 6 migration.",
    prompt: `You are a Swift Concurrency expert. Review code for:
- Data race safety at isolation boundaries
- Proper use of @MainActor (justified, not blanket)
- Structured concurrency preferred over unstructured Task
- No semaphores/locks in async contexts
- @unchecked Sendable has documented safety invariants
- Correct actor isolation patterns
Provide diagnosis, minimal fix, and verification steps.`,
    tools: ["Read", "Glob", "Grep"],
    model: "sonnet",
  },

  "swift-testing-expert": {
    description:
      "Swift Testing specialist for writing tests, XCTest migration, and test quality.",
    prompt: `You are a Swift Testing expert. Review test code for:
- #require for prerequisites, #expect for assertions
- Parameterized tests where tests share logic
- Parallel safety (no shared mutable state without .serialized)
- Proper async awaiting
- import Testing only in test targets
- Traits and tags over naming conventions
Provide specific improvement suggestions with code examples.`,
    tools: ["Read", "Glob", "Grep"],
    model: "sonnet",
  },
};

async function runIOSReview(targetPath: string = ".") {
  console.log("🍎 Running iOS Agent Team review...\n");

  // Phase 1: Each specialist reviews in parallel via subagents
  const reviewPrompt = `
You are an iOS tech lead coordinating a code review. Use each of your specialist
subagents to review the codebase at "${targetPath}":

1. Use the swiftui-expert agent to review all SwiftUI view files
2. Use the swift-concurrency-expert agent to review concurrency patterns
3. Use the swift-testing-expert agent to review test quality

Run all three reviews, then synthesize their findings into a single prioritized
report with sections: Critical, Warnings, Suggestions.
`;

  const options: ClaudeAgentOptions = {
    allowed_tools: ["Read", "Glob", "Grep", "Agent"],
    agents,
    model: "claude-sonnet-4-6",
  };

  for await (const message of query({ prompt: reviewPrompt, options })) {
    // Handle different message types
    if ("type" in message) {
      switch (message.type) {
        case "agent_start":
          console.log(`  → Started: ${message.agent_type}`);
          break;
        case "agent_end":
          console.log(`  ✓ Completed: ${message.agent_type}`);
          break;
        case "text":
          process.stdout.write(message.text);
          break;
      }
    }

    // Final result
    if ("result" in message && message.result) {
      console.log("\n\n📋 Review Complete:\n");
      console.log(message.result);
    }
  }
}

// Run
runIOSReview(process.argv[2] || ".").catch(console.error);
