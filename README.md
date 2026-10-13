# iOS Agent Team

A team of five iOS specialist agents for **Claude Code**, **Codex**, and **Gemini CLI**. Install it into a Swift project and ask for iOS work in plain language; the runtime delegates to the right specialist.

It is a set of agent definitions, reference skills, and an installer. It is not an iOS app, a CI service, or a hosted API.

## Contents

- [The team](#the-team)
- [Requirements](#requirements)
- [Install and update](#install-and-update)
- [What each runtime gets](#what-each-runtime-gets)
- [Using the team](#using-the-team)
- [Skills](#skills)
- [Optional: Jev provider routing](#optional-jev-provider-routing)
- [Optional: SDK and CI examples](#optional-sdk-and-ci-examples)
- [Optional: routing evals](#optional-routing-evals)
- [Customizing](#customizing)
- [Repository layout](#repository-layout)
- [Validation](#validation)

## The team

| Agent | Use it for | Model tier (Claude) |
| --- | --- | --- |
| `swiftui-expert` | SwiftUI views, state, navigation, Liquid Glass, charts, accessibility, performance | Sonnet |
| `swift-concurrency-expert` | `async`/`await`, actors, `Sendable`, `@MainActor`, Swift 6 migration | Sonnet |
| `swift-testing-expert` | Swift Testing, XCTest migration, parameterized tests, flaky tests | Sonnet |
| `ios-reviewer` | Cross-cutting review of changed code: SwiftUI, concurrency, tests, performance, accessibility | Sonnet |
| `ios-lead` | Work that spans several of the above, large-feature planning, architecture questions | Opus |

Rule of thumb: for a task in a single area, talk to that specialist. `ios-lead` runs on the most expensive model and exists to coordinate work that crosses areas, so reach for it only then.

`ios-reviewer` does not edit files through edit tools. It can still run shell commands in Claude Code and Gemini CLI; in Codex it runs in a read-only sandbox. The other specialists may edit files when asked.

## Requirements

| Needed for | Requirement |
| --- | --- |
| Any install | `bash`, `git`, and the CLI you are installing for (`claude`, `codex`, or `gemini`) |
| Gemini adapter | The `gemini` CLI on your `PATH`; the adapter is installed as a Gemini extension |
| Jev routing, SDK review, `bun test` | [Bun](https://bun.sh) |
| Python CI example, routing evals | Python 3 (standard library only for evals) |
| Claude-only memory (`memory: project`) | Claude Code v2.1.33 or newer |

The installer, the agents, and the skills need nothing else. Jev, the SDKs, and the evals are optional.

## Install and update

Clone the repository, then install the adapter for the runtime your project uses.

```bash
git clone https://github.com/viniciuscarvalho/ios-agent-team.git
cd ios-agent-team

./install.sh --provider claude /path/to/your-ios-project
./install.sh --provider codex  /path/to/your-ios-project
./install.sh --provider gemini                  # installs a Gemini extension; no project path
./install.sh --provider all    /path/to/your-ios-project
```

`--provider` defaults to `claude`. The target path defaults to the current directory.

### What the installer does

| Provider | Copies into the project | Notes |
| --- | --- | --- |
| `claude` | `.claude/agents/`, `.claude/skills/` | Creates `CLAUDE.md` from `CLAUDE.md.snippet` only if none exists |
| `codex` | `.codex/agents/`, `.agents/skills/` | Creates `AGENTS.md` only if none exists |
| `gemini` | Nothing in the project | Runs `gemini extensions install` for this repository; the project path is ignored |

### If you already have `CLAUDE.md` or `AGENTS.md`

The installer leaves an existing file **untouched and prints nothing about it**. Append the team section yourself, otherwise the delegation guidance and project conventions are not installed:

```bash
cat CLAUDE.md.snippet >> /path/to/your-ios-project/CLAUDE.md   # Claude Code
cat AGENTS.md         >> /path/to/your-ios-project/AGENTS.md   # Codex
```

Then edit the "Project conventions" block of the snippet to match your deployment target, Swift version, and test command.

### Update

Pull the clone and run the installer again, adding `--update`:

```bash
git pull --ff-only
./install.sh --provider claude --update /path/to/your-ios-project
```

For `claude` and `codex`, `--update` behaves exactly like a fresh install: it **overwrites** the agent and skill files it ships. Local edits to those files are lost, so keep customizations in a separate commit or branch. For `gemini`, `--update` runs `gemini extensions update`.

### One-line install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/viniciuscarvalho/ios-agent-team/main/install.sh) --provider codex /path/to/your-ios-project
```

Use this for a first install only. Prefer a clone for updates and for the Gemini adapter.

## What each runtime gets

The three adapters describe the same team, but the runtimes differ and the adapters are not identical.

| | Claude Code | Codex | Gemini CLI |
| --- | --- | --- | --- |
| Agent files | `.claude/agents/*.md` | `.codex/agents/*.toml` | `agents/*.md` in the extension |
| Agent instructions | Full | Full | Short summaries |
| Reference skills | `.claude/skills/` | `.agents/skills/` | Not installed by the extension |
| Project instructions | `CLAUDE.md` | `AGENTS.md` | `GEMINI.md` |
| `ios-lead` delegates to specialists | Yes (`Agent(...)` allowlist) | Written to, but not verified | No: Gemini subagents cannot call other subagents |
| Persistent agent memory | Yes (`memory: project`) | No | No |

Practical consequences:

- **Gemini:** the specialists work from short instructions and do not preload the skills. Gemini CLI also discovers skills in a workspace's `.agents/skills/` directory (see its documentation), so installing the Codex adapter into the same project makes them available. This has not been tested here. Treat `ios-lead` on Gemini as guidance for the main session to orchestrate, not as a coordinator agent.
- **Codex:** `ios-lead` is defined to coordinate, but whether a Codex subagent can spawn other subagents is not documented and has not been tested. Name the specialists explicitly in your prompt if delegation does not happen.

The agent definitions are maintained by hand in each format. When you change one, apply the same change to the other adapters.

## Using the team

### Just ask

Open the installed project in your runtime and describe the work. The runtime picks a specialist from each agent's description:

```text
Build a settings screen with toggles and a theme picker.
Fix the Sendable errors after enabling Swift 6 language mode.
Migrate the Auth module's XCTest suite to Swift Testing.
Review my uncommitted changes before I open the PR.
Plan an onboarding flow with offline loading and tests.
```

Delegation is the runtime's decision and is not guaranteed. In Claude Code the main session often answers simple questions itself instead of spawning an agent.

### Pick an agent explicitly

| Runtime | How |
| --- | --- |
| Claude Code | `@"swiftui-expert (agent)" add Liquid Glass to the toolbar`, or start a whole session as the coordinator with `claude --agent ios-lead` |
| Codex | Name the agent in the prompt: "Have `swift-testing-expert` migrate these tests" |
| Gemini CLI | Start the prompt with `@swiftui-expert ...` |

### Claude Code extras

These apply to Claude Code only.

**Subagent context forking.** With forking enabled, a specialist inherits the parent's conversation instead of starting blank, so files read once are not read again. Enable it for a project in `.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_FORK_SUBAGENT": "1" } }
```

Without it, specialists re-read files themselves. `examples/settings.json` shows this together with a permissions allowlist for common `swift` and `xcodebuild` commands.

**Agent teams (experimental).** For large features you can ask Claude to run teammates in parallel. This needs `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in the `env` block of the same settings file. Copy-paste prompts are in `examples/agent-team-prompts.md`.

**Hooks.** `examples/hooks.json` runs `swift build` or `swift test` when a specialist finishes. Do not copy `examples/settings.json` or `examples/hooks.json` into Codex or Gemini projects.

## Skills

Specialists draw on four reference skills, each a `SKILL.md` with a `references/` directory:

| Skill | Covers |
| --- | --- |
| `swiftui-expert-skill` | State, composition, performance, animation, accessibility, charts, Liquid Glass, macOS |
| `swiftui-ui-patterns` | Navigation, sheets, deep links, previews, app wiring |
| `swift-concurrency` | Actors, `Sendable`, tasks, async sequences, migration, linting |
| `swift-testing-expert` | `#expect`/`#require`, traits, parameterization, XCTest migration |

They are installed to `.claude/skills/` for Claude Code and `.agents/skills/` for Codex. The two copies are separate; keep them in sync if you edit one. Treat them as upstream reference material rather than project code.

## Optional: Jev provider routing

[TypeSafe](https://docs.typesafe.ai)'s Jev model can decide **which runtime** (Claude, Codex, or Gemini) should handle a task, and which review specialists are relevant, before anything else starts. It is optional: the agents, the installer, and normal use never call it.

```text
task → Jev → allowed provider → that runtime's native adapter → selected specialists
```

Jev receives only the task text and the list of providers you allow. It does not execute anything. If `TYPESAFE_API_KEY` is missing, the task is empty, or the API call fails, routing falls back deterministically: the first allowed provider, and all review specialists.

Put a TypeSafe API key in a local `.env` (already git-ignored):

```bash
TYPESAFE_API_KEY=your_key
```

Get the provider and specialists as JSON; this prints a decision and never starts an LLM:

```bash
IOS_AGENT_PROVIDERS=codex,gemini bun run sdk/jev-route.ts "Review this SwiftUI screen and its tests"
```

`IOS_AGENT_PROVIDERS` is a comma-separated allowlist (`claude`, `codex`, `gemini`) and defaults to all three.

Jev does not decide whether to use `ios-lead` versus a single specialist, and it does not launch Codex or Gemini. There is no Codex or Gemini SDK runner here; those runtimes run through their own installed adapters.

## Optional: SDK and CI examples

Two examples run the review specialists programmatically, for CI or a review bot. They are starting points rather than a packaged tool.

| File | Needs | Run |
| --- | --- | --- |
| `sdk/ios-review-agent.ts` | Bun, `@anthropic-ai/claude-agent-sdk`, Claude authentication; `TYPESAFE_API_KEY` optional | `bun add @anthropic-ai/claude-agent-sdk` then `bun run sdk/ios-review-agent.ts ./Sources "Review async image loading"` |
| `sdk/ios_ci_review.py` | Python 3, `claude-agent-sdk`, Claude authentication; does not use Jev | `pip install claude-agent-sdk` then `python sdk/ios_ci_review.py --path ./Sources` |

The TypeScript example asks Jev which specialists to include and gives only those to Claude. Its specialist prompts are separate, shorter copies of the agent definitions.

## Optional: routing evals

`evals/` measures how the main Claude Code session routes prompts, for example whether single-area tasks reach a specialist or the Opus `ios-lead`. It is a maintenance tool for this repository and is not needed to use the team.

- `evals/golden/prompts.jsonl`: 60 labelled prompts in Portuguese and English (`swiftui`, `concurrency`, `testing`, `review`, `cross-cutting`, `not-ios`), with ambiguous cases flagged.
- `evals/replay.py`: extracts `.claude/` and `CLAUDE.md.snippet` from each git ref you name into a throwaway project, runs `claude -p` per prompt, and stops at the first subagent spawn. The delegated task itself never runs.

```bash
python3 evals/replay.py run --variant baseline=origin/main --variant tuned=my-branch --repeats 3
python3 evals/replay.py report evals/results/<file>.jsonl
```

Things to know before trusting a result:

- **It spends real tokens.** Each prompt, variant, and repeat is a `claude -p` call. Start small with `--limit` or `--ids`.
- **The main session is nondeterministic.** One run per prompt shows little; use `--repeats`.
- **Compare spawn rates, not token totals.** Runs that stop at a spawn use far fewer tokens than runs that finish.
- The fixture project has no Swift sources, so many runs answer directly instead of delegating.
- The main-session model defaults to `sonnet` (`--model`) and may differ from yours.

Results are written to `evals/results/`, which is git-ignored.

## Customizing

- **Change a model.** Claude: the `model:` field in the agent's frontmatter (`opus`, `sonnet`, `haiku`). Codex: add `model = "..."` to the agent's TOML. Gemini: the `model` frontmatter field.
- **Add project context.** Edit `CLAUDE.md`, `AGENTS.md`, or `GEMINI.md` with your architecture, persistence layer, and CI.
- **Add a specialist.** Create the agent in each format you use, for example `.claude/agents/my-specialist.md`:

  ```yaml
  ---
  name: my-specialist
  description: Specialist for [domain]. Use when [trigger].
  tools: Read, Edit, Bash, Grep, Glob
  model: sonnet
  skills:
    - my-custom-skill
  ---
  You are a specialist in [domain]...
  ```

  Add the same agent as `.codex/agents/my-specialist.toml` and `agents/my-specialist.md`. If `ios-lead` should delegate to it on Claude Code, add its name to the `Agent(...)` list in `ios-lead`'s `tools`.
- **Agent memory (Claude Code).** Each Claude agent has `memory: project`, which keeps a `MEMORY.md` per agent under `.claude/agent-memory/<name>/` in your project. Browse it with `/memory`. Switch to `user` or `local` scope in the frontmatter if you do not want it committed.

## Repository layout

```text
.claude/agents/, .claude/skills/   Claude Code adapter
.codex/agents/, .agents/skills/    Codex adapter
agents/, gemini-extension.json     Gemini CLI extension
CLAUDE.md.snippet, AGENTS.md, GEMINI.md   project instructions per runtime
install.sh                         installer for all three
sdk/                               Jev router and review SDK examples
evals/                             routing replay and golden prompts
examples/                          Claude Code settings, hooks, team prompts
```

## Validation

```bash
bun test sdk/jev-review-router.test.ts
```

These tests cover the deterministic specialist and provider fallbacks. They do not prove provider authentication, and they do not prove a live Claude, Codex, or Gemini run.

## License

MIT
