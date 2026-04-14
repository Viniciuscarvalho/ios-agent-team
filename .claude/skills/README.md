# Skills Directory

Skills are reference material that agents preload via the `skills:` field in their frontmatter. Each skill is a directory containing a `SKILL.md` and optionally a `references/` subdirectory with detailed API docs.

## Expected structure

```
.claude/skills/
├── swiftui-expert-skill/
│   ├── SKILL.md                          ← Main skill definition
│   └── references/
│       ├── latest-apis.md
│       ├── state-management.md
│       ├── view-structure.md
│       ├── performance-patterns.md
│       ├── list-patterns.md
│       ├── animation-basics.md
│       ├── animation-transitions.md
│       ├── animation-advanced.md
│       ├── accessibility-patterns.md
│       ├── charts.md
│       ├── charts-accessibility.md
│       ├── liquid-glass.md
│       ├── sheet-navigation-patterns.md
│       ├── scroll-patterns.md
│       ├── image-optimization.md
│       ├── layout-best-practices.md
│       ├── macos-scenes.md
│       ├── macos-window-styling.md
│       └── macos-views.md
│
├── swiftui-ui-patterns/
│   ├── SKILL.md
│   └── references/
│       ├── components-index.md
│       ├── navigationstack.md
│       ├── sheets.md
│       ├── deeplinks.md
│       ├── app-wiring.md
│       ├── async-state.md
│       ├── previews.md
│       ├── performance.md
│       └── scroll-reveal.md
│
├── swift-concurrency/
│   ├── SKILL.md
│   └── references/
│       ├── async-await-basics.md
│       ├── tasks.md
│       ├── threading.md
│       ├── memory-management.md
│       ├── actors.md
│       ├── sendable.md
│       ├── linting.md
│       ├── async-sequences.md
│       ├── core-data.md
│       ├── performance.md
│       ├── testing.md
│       ├── migration.md
│       └── glossary.md
│
└── swift-testing-expert/
    ├── SKILL.md
    └── references/
        ├── _index.md
        ├── fundamentals.md
        ├── expectations.md
        ├── traits-and-tags.md
        ├── parameterized-testing.md
        ├── parallelization-and-isolation.md
        ├── performance-and-best-practices.md
        ├── async-testing-and-waiting.md
        ├── migration-from-xctest.md
        └── xcode-workflows.md
```

## How agents use skills

When an agent has `skills: [swift-concurrency]` in its frontmatter, Claude Code injects the full content of that skill's `SKILL.md` into the agent's context at startup. The agent can then reference the skill's guidance and consult the `references/` files as needed.

## Adding your own skills

1. Create a directory under `.claude/skills/your-skill-name/`
2. Add a `SKILL.md` with YAML frontmatter (`name`, `description`) and Markdown body
3. Optionally add `references/` for detailed sub-topic docs
4. Reference the skill name in an agent's `skills:` list
