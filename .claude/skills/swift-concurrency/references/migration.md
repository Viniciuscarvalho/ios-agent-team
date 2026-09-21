# Swift 5 → Swift 6 Migration Playbook

Swift 6 language mode makes data-race safety checks (previously optional, warning-level) into compiler **errors**. The migration is per-module/per-target, not all-or-nothing for the whole app, and is designed to be climbed incrementally.

## Step 0: Pick your unit of migration

Migrate one target/module at a time — start with leaf modules that have few dependents (a `Core`/`Utilities` package, a single feature module), not the app target itself. A module can only be flipped to Swift 6 language mode once every module it depends on either compiles cleanly under strict concurrency or is bridged with `@preconcurrency import`.

## Step 1: Enable targeted checking first

Before touching the language mode, turn on `-strict-concurrency=targeted` (Xcode: `SWIFT_STRICT_CONCURRENCY = targeted`) for the target you're migrating. This only flags code that already touches concurrency constructs (actors, `async`, `Task`, `Sendable`), so it surfaces real issues without drowning you in warnings about code that was never concurrent to begin with.

Fix what it flags — typically:
- Singletons/globals that need `Sendable` or actor isolation.
- Delegate/completion-handler closures that need `@Sendable` or restructuring.

## Step 2: Enable upcoming features one at a time

Several Swift 6 behaviors shipped earlier as opt-in "upcoming features" — enabling them individually, before the full language mode flip, isolates their effects and makes each one's fallout reviewable on its own:

```swift
.target(
    name: "MyFeature",
    swiftSettings: [
        .enableUpcomingFeature("DisableOutwardActorIsolation"),
        .enableUpcomingFeature("IsolatedDefaultValues"),
        .enableUpcomingFeature("GlobalConcurrency"),
        .enableUpcomingFeature("RegionBasedIsolation"),
    ]
)
```

Enable, build, fix what breaks, commit — one feature at a time rather than all at once — so a regression is traceable to a specific feature flag rather than a big bang of unrelated changes.

## Step 3: Raise strict concurrency to `complete`

```swift
swiftSettings: [.enableUpcomingFeature("StrictConcurrency")]
// or, in Xcode build settings: SWIFT_STRICT_CONCURRENCY = complete
```

This is functionally the full set of Swift 6 data-race checks, still surfaced as **warnings** (you're still in Swift 5 language mode). Work through them using the diagnostic-specific fixes in `linting.md`:

1. Add `Sendable` conformances to plain value types crossing boundaries.
2. Isolate UI-facing types to `@MainActor` as whole types, not method-by-method.
3. Convert shared mutable reference types to actors, or lock them with `@unchecked Sendable` + documented invariant as a last resort.
4. Use `sending` for one-shot transfers of non-Sendable values instead of forcing full `Sendable` conformance where it doesn't fit the type's actual usage.
5. Bridge un-migrated dependencies with `@preconcurrency import` so their warnings don't block you — track these as follow-up work, don't leave them forever.

## Step 4: Flip the language mode to Swift 6

Once a target builds clean (zero strict-concurrency warnings) at `complete`, flip its language mode:

```swift
// Package.swift, per-target:
.target(name: "MyFeature", swiftSettings: [.swiftLanguageMode(.v6)])

// Or for the whole package (only once every target is ready):
// swift-tools-version: 6.0
```

In Xcode, set the target's Swift Language Version build setting to "Swift 6." Warnings from `complete` checking become **errors** at this point — that's expected and is the actual safety guarantee you migrated for.

## Step 5: Move up the dependency graph

Repeat Steps 1–4 for the next module up the dependency chain, now that its dependencies are Swift-6-clean. Modules that depend on not-yet-migrated modules can still build in Swift 5 mode while importing Swift-6-mode modules — language mode is a per-module setting, and interop between modes is supported specifically so migration doesn't require a single atomic flip across an entire app.

## Step 6: Retire `@preconcurrency` bridges

Once a previously un-migrated dependency ships proper `Sendable`/`async` annotations (or you finish migrating an internal module you'd bridged), remove the `@preconcurrency import` — leaving it in place silently suppresses checks against a dependency that no longer needs the exemption.

## Practical sequencing tips

- **Don't try to fix every warning by adding `Sendable` everywhere.** Some warnings are telling you an isolation domain is wrong (e.g., a delegate object that should be `@MainActor`, or a manager that should be an actor) — fix the design, not just the annotation.
- **Budget real time for singletons and legacy delegate patterns.** These concentrate the bulk of migration work in most codebases — global mutable state and callback-heavy APIs predate Swift Concurrency's assumptions.
- **Land `complete`-level warning fixes as normal, reviewable PRs** before the language-mode flip — the flip itself should then be a low-risk, mechanical commit (just the build setting change) because all the real work already happened and was reviewed as warnings.
- **CI gate**: fail builds on new strict-concurrency warnings once a module is at `complete`, so the backlog can't silently regrow while you migrate the next module.
- **Test coverage before migrating a module** pays off disproportionately — concurrency fixes (adding actors, changing isolation) can subtly change execution order/timing; a good async test suite (see `testing.md`) catches regressions the compiler can't.

## Reference: which flag does what

| Flag / setting | Effect |
|---|---|
| `-strict-concurrency=minimal` \| `targeted` \| `complete` | Warning-level checking depth, while still in Swift 5 mode |
| `SWIFT_STRICT_CONCURRENCY` (Xcode) | Same, as an Xcode build setting |
| `.enableUpcomingFeature("StrictConcurrency")` | SwiftPM equivalent of `complete` |
| `.enableUpcomingFeature("<FeatureName>")` | Opt into one specific Swift 6 behavior early, individually |
| `-swift-version 6` / `.swiftLanguageMode(.v6)` | Flip the actual language mode — turns complete-level checks into errors |
| `swift-tools-version: 6.0` | Sets Swift 6 as the default language mode for every target in the package |
| `@preconcurrency import Module` | Downgrade a specific import's concurrency-safety violations to warnings |
