# iOS Agent Team for Claude Code

Five specialized iOS agents that plug into any Swift project. Claude Code auto-delegates to the right expert based on your task.

```
              You (Developer)
                    │
          ┌─────────▼──────────┐
          │   ios-lead (Opus)   │  Coordinator
          └──┬───┬───┬───┬─────┘
             │   │   │   │
     ┌───────┘   │   │   └───────┐
     ▼           ▼   ▼           ▼
 swiftui    concurrency testing  reviewer
 expert      expert    expert    (Sonnet)
 (Sonnet)   (Sonnet)  (Sonnet)
```

| Agent                      | Handles                                                 |
| -------------------------- | ------------------------------------------------------- |
| `ios-lead`                 | Coordinates multi-concern tasks, architecture decisions |
| `swiftui-expert`           | Views, state, navigation, Liquid Glass, charts          |
| `swift-concurrency-expert` | async/await, actors, Sendable, Swift 6 migration        |
| `swift-testing-expert`     | Swift Testing, XCTest migration, parameterized tests    |
| `ios-reviewer`             | Cross-cutting code review across all domains            |

## Install

### Option A: One command

```bash
cd your-ios-project
bash <(curl -s https://raw.githubusercontent.com/viniciuscarvalho/ios-agent-team/main/install.sh)
```

### Option B: Script from clone

```bash
git clone https://github.com/viniciuscarvalho/ios-agent-team.git /tmp/ios-agent-team
/tmp/ios-agent-team/install.sh /path/to/your-ios-project
rm -rf /tmp/ios-agent-team
```

### Option C: Manual

```bash
# From your iOS project root
cp -r path/to/ios-agent-team/.claude/agents/ .claude/agents/
cp -r path/to/ios-agent-team/.claude/skills/ .claude/skills/
cat path/to/ios-agent-team/CLAUDE.md.snippet >> CLAUDE.md
```

Then edit `CLAUDE.md` to match your project's deployment target, Swift version, and conventions.

### Global install (all projects)

```bash
cp -r .claude/agents/*.md ~/.claude/agents/
```

## Usage

Just talk to Claude Code — it picks the right agent automatically:

```
"Build a settings screen with toggle switches"         → swiftui-expert
"Fix these Sendable errors after Swift 6 upgrade"      → swift-concurrency-expert
"Migrate our XCTest suite to Swift Testing"             → swift-testing-expert
"Review the code I just wrote"                          → ios-reviewer
```

You can also @-mention an agent directly:

```
@"swiftui-expert (agent)" add Liquid Glass effects to the toolbar
```

Or run a full session as the lead:

```bash
claude --agent ios-lead
```

### Agent teams (parallel work)

For large features, ask Claude to spawn a team:

```
Build the onboarding flow as an agent team:
- One teammate on SwiftUI views
- One on async data loading
- One writing tests
```

Requires the experimental flag in `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### Subagent context forking

Claude Code can fork the parent agent's full conversation into each subagent it spawns, instead of starting the child blank. For this team that means `ios-lead` does the upfront exploration once (reads `Package.swift`, scans the affected sources, sketches a plan), and each specialist it delegates to inherits that context — no re-reading, no re-deriving the deployment target, no re-asking "what file should I look at?". Children 2..N also share the parent's prompt-cache prefix, so wide fan-out gets cheaper.

Enable it per-project in `.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_FORK_SUBAGENT": "1"
  }
}
```

For ad-hoc opt-in without the env var, prefix a delegation with the `/fork` slash command — useful when the parent has just done a chunky exploration you want the next subagent to inherit.

This is independent of `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`; you can run either, both, or neither. **Caveat**: if you use `feature-marker`'s spec-driven mode, prefer `/fork` over the env var so forking stays opt-in per spawn and doesn't double-inherit through the spec orchestration.

## Skills

Agents load domain knowledge from `.claude/skills/`. Each skill has a `SKILL.md` and a `references/` directory. See [`.claude/skills/README.md`](.claude/skills/README.md) for the full directory structure.

You can add your own skills by creating a directory under `.claude/skills/` and referencing it in an agent's `skills:` frontmatter field.

## Customization

**Change models** — Edit any agent's `model:` field (`opus`, `sonnet`, or `haiku`).

**Add project context** — Edit `CLAUDE.md` in your project root:

```markdown
## Project Context

- Architecture: TCA (The Composable Architecture)
- Uses SwiftData for persistence
- CI runs on GitHub Actions
```

**Add a specialist** — Create `.claude/agents/my-specialist.md` with YAML frontmatter:

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

## SDK examples

The `sdk/` directory has TypeScript and Python examples for running review agents programmatically in CI/CD:

```bash
# TypeScript
bun run sdk/ios-review-agent.ts

# Python
python sdk/ios_ci_review.py --path ./Sources
```

## Requirements

- Claude Code v2.1.0+ (subagents) or v2.1.32+ (agent teams); subagent context forking requires the Claude Code build that ships `CLAUDE_CODE_FORK_SUBAGENT` (verify against your installed version)
- Anthropic API key or Claude Pro/Team/Enterprise subscription

## License

MIT
