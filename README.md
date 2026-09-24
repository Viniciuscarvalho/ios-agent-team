# iOS Agent Team

A portable iOS specialist team for Claude Code, Codex, and Gemini CLI. It provides five agents for SwiftUI, Swift Concurrency, testing, and code review; it is not an iOS app, CI service, or hosted API.

## What is included

| Agent | Responsibility |
| --- | --- |
| `ios-lead` | Coordinates multi-area iOS work. |
| `swiftui-expert` | SwiftUI views, state, navigation, performance, and accessibility. |
| `swift-concurrency-expert` | `async`/`await`, actors, `Sendable`, and Swift 6 migration. |
| `swift-testing-expert` | Swift Testing, XCTest, coverage, and flaky-test fixes. |
| `ios-reviewer` | Read-only cross-cutting review. |

The same team is packaged in each runtime's native format:

| Runtime | Installed artifacts |
| --- | --- |
| Claude Code | `.claude/agents/`, `.claude/skills/`, and `CLAUDE.md` |
| Codex | `.codex/agents/`, `.agents/skills/`, and `AGENTS.md` |
| Gemini CLI | A local extension with `agents/` and `GEMINI.md` |

## Install and update

Clone the repository, then install the adapter your project uses:

```bash
git clone https://github.com/viniciuscarvalho/ios-agent-team.git
cd ios-agent-team
./install.sh --provider codex /path/to/your-ios-project
./install.sh --provider claude /path/to/your-ios-project
./install.sh --provider gemini
```

`--provider all` installs every available adapter. Gemini requires the `gemini` CLI because its adapter is installed as a Gemini extension. The script never overwrites an existing `AGENTS.md` or `CLAUDE.md`.

To update a clone, pull it and repeat the command with `--update`:

```bash
git pull --ff-only
./install.sh --provider codex --update /path/to/your-ios-project
./install.sh --provider claude --update /path/to/your-ios-project
./install.sh --provider gemini --update
```

For a one-line Claude or Codex installation, pass the same flags after the remote script:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/viniciuscarvalho/ios-agent-team/main/install.sh) --provider codex /path/to/your-ios-project
```

## Quick start

Open the installed project with your chosen runtime and ask for work normally, or select an agent explicitly when your runtime supports it:

```text
Review this SwiftUI settings screen for VoiceOver, state ownership, and Swift 6 safety.
Migrate these XCTest cases to Swift Testing.
Investigate the Sendable errors in this feature.
```

`ios-lead` is the coordinator for broad tasks. `ios-reviewer` is intentionally read-only; the other specialists may edit files when asked.

## Jev provider routing

Jev chooses a runtime before any provider SDK is started. It receives only the task text and a caller-provided allowlist; application code validates the result and falls back deterministically if the key is absent or the API fails.

```text
task → Jev → allowed provider (Claude / Codex / Gemini) → native runtime → selected iOS specialists
```

Create a local `.env` with the key (it is ignored by Git):

```bash
TYPESAFE_API_KEY=your_key
```

Use the router to obtain the provider and the relevant specialists. The output is JSON and never starts an LLM itself:

```bash
IOS_AGENT_PROVIDERS=codex,gemini bun run sdk/jev-route.ts "Review this SwiftUI screen and its tests"
```

The existing `sdk/ios-review-agent.ts` remains the optional Claude Agent SDK adapter. It calls Jev before `query()` and passes only Jev-selected specialist definitions to Claude. It requires the Claude SDK and its own authentication:

```bash
bun add @anthropic-ai/claude-agent-sdk
bun run sdk/ios-review-agent.ts ./Sources "Review async image loading"
```

No Codex or Gemini SDK runner is included: their native project adapters are installed instead. This keeps provider credentials and execution under the respective CLI rather than pretending the runtimes have a shared SDK.

## Validation

```bash
bun test sdk/jev-review-router.test.ts
```

The tests cover deterministic specialist and provider fallbacks. They do not prove provider authentication or a live Claude, Codex, or Gemini run.

`examples/settings.json` and `examples/hooks.json` remain Claude Code examples; do not copy them into Codex or Gemini projects.

## License

MIT
