---
name: swift-concurrency
description: Swift Concurrency reference covering async/await, actors, Sendable, Task lifecycle, data-race safety, and Swift 6 migration — load when diagnosing concurrency bugs, refactoring callback code, or fixing strict-concurrency diagnostics.
---

# Swift Concurrency

Swift Concurrency (async/await, actors, structured concurrency) is Swift's model for expressing asynchronous and parallel code while the compiler statically prevents data races. This skill is the entry point; each topic below has a dedicated deep-dive in `references/`.

## Mental model

Three ideas underpin everything else:

1. **Isolation domains.** Every piece of mutable state lives in exactly one isolation domain: a specific actor, `@MainActor`, or "nonisolated" (safe from anywhere because it's immutable or a value type copy). The compiler tracks which domain code is running in and forbids synchronous access to state in a different domain.
2. **Structured concurrency.** Async work forms a tree. A `Task` cannot outlive its parent scope unless explicitly detached; cancellation and errors propagate down the tree. This is what makes async code as reasonable-about as synchronous code with `defer`.
3. **Sendable is the boundary contract.** Crossing an isolation boundary (actor to actor, actor to task, thread to thread) requires the value being passed to be safe to share — either `Sendable`, or `sending` (uniquely owned, checked by region-based isolation).

## Quick reference

| Topic | File |
|---|---|
| async/await fundamentals, throwing async functions, continuations | `references/async-await-basics.md` |
| `Task`, `TaskGroup`, cancellation, structured concurrency | `references/tasks.md` |
| Cooperative thread pool, avoiding thread explosion, executors | `references/threading.md` |
| Retain cycles in closures/Tasks, weak/unowned in async code | `references/memory-management.md` |
| Actor isolation, reentrancy, `@MainActor`, global actors | `references/actors.md` |
| `Sendable`, `@unchecked Sendable`, `sending`, region-based isolation | `references/sendable.md` |
| Swift 6 strict concurrency diagnostics and how to fix them | `references/linting.md` |
| `AsyncSequence`, `AsyncStream`, typed failures, cancellation | `references/async-sequences.md` |
| Core Data + concurrency, `NSManagedObjectContext.perform` | `references/core-data.md` |
| Actor contention, excessive hopping, concurrency perf pitfalls | `references/performance.md` |
| Testing async/actor code with Swift Testing | `references/testing.md` |
| Swift 5 → Swift 6 migration playbook | `references/migration.md` |
| Terminology (isolation, data race, actor-isolated, etc.) | `references/glossary.md` |

## Core rules to apply by default

- **Prefer `async`/`await` over completion handlers** for new code. Wrap legacy callback APIs once, at the boundary, with `withCheckedThrowingContinuation` — never sprinkle continuations through business logic. See `async-await-basics.md`.
- **UI state is `@MainActor`, always.** ViewModels backing SwiftUI/UIKit views should be `@MainActor`-isolated (or `@MainActor final class`), not sprinkled with manual `DispatchQueue.main.async`. See `actors.md`.
- **Model concurrency domains as actors, not locks.** If two call sites can race on the same mutable state, put that state behind an `actor`. Don't reach for `NSLock`/`DispatchSemaphore` unless you're bridging into synchronous, non-async code. See `actors.md` and `performance.md`.
- **Every cross-boundary type must be `Sendable`.** Value types with `Sendable` members get it for free; reference types need explicit conformance (usually via internal locking or `@unchecked Sendable` with a documented invariant). See `sendable.md`.
- **Cooperative pool threads must never block.** No `Thread.sleep`, no synchronous I/O, no blocking locks inside `async` functions — that starves the pool. Use `Task.sleep(for:)` and async-native APIs. See `threading.md`.
- **Cancellation is cooperative, not automatic.** Long-running loops must call `Task.checkCancellation()` or check `Task.isCancelled`; `Task.sleep` and most URLSession/Core Data async APIs already throw `CancellationError` for you. See `tasks.md`.
- **Weak-capture `self` in detached/long-lived Tasks**, not in short `Task { }` blocks tied to a view's lifetime — over-using `[weak self]` in structured, view-scoped tasks is unnecessary noise. See `memory-management.md`.
- **Target Swift 6 language mode for new modules.** Enable it incrementally per-target (`-strict-concurrency=targeted` → `complete` → language mode 6), not as a big-bang flip on a large app. See `migration.md`.
- **Never use `@unchecked Sendable` to silence a warning you don't understand.** It's an escape hatch for cases you've manually verified are race-free (e.g., an immutable class, or a class with all mutable state behind a lock) — document the invariant in a comment next to the conformance.

## When to reach for which construct

| Need | Use |
|---|---|
| Shared mutable state accessed from multiple tasks | `actor` |
| UI-affecting state / anything touching `UIKit`/`AppKit`/SwiftUI | `@MainActor` |
| Fire union of independent async child tasks, want results as a batch | `TaskGroup` / `async let` |
| One-off async work not tied to the current function's scope | `Task { }` (inherits actor context) or `Task.detached { }` (opts out — rare) |
| Bridge a delegate/completion-handler API | `withCheckedContinuation` / `withCheckedThrowingContinuation` |
| Push a stream of values over time | `AsyncStream` / `AsyncThrowingStream` |
| Multi-step pipeline over an async stream | Custom `AsyncSequence` conformance |

Consult the reference files for full code examples, migration steps, and diagnostic-by-diagnostic fixes.
