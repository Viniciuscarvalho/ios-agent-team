# Swift 6 Strict Concurrency Diagnostics

## Checking levels and how to enable them

Strict concurrency checking has three levels, controlled by the `-strict-concurrency` compiler flag (or the `SWIFT_STRICT_CONCURRENCY` build setting in Xcode):

| Level | Behavior |
|---|---|
| `minimal` | Default in Swift 5 language mode. Only checks code that explicitly opts into concurrency (e.g., types already conforming to `Sendable`). |
| `targeted` | Checks code that uses concurrency constructs (`async`, actors, `Task`) but doesn't flag plain synchronous code that never touches them. Good first migration step. |
| `complete` | Full Swift-6-style checking as warnings, while still in Swift 5 mode. This is the level to reach before flipping language modes. |

In Swift 6 language mode, `complete`-level checks are always on and are **errors**, not warnings — there's no separate flag to weaken them once you've moved the language mode itself to 6. `-swift-version 6` (or `swiftLanguageMode(.v6)` / `swift-tools-version: 6.0` in `Package.swift`) is what actually switches the language mode; `-strict-concurrency=complete` is how you preview the same checks as warnings while still in Swift 5 mode.

```swift
// Package.swift — enable per-target during migration
.target(
    name: "MyFeature",
    swiftSettings: [
        .enableUpcomingFeature("StrictConcurrency")   // Swift 5 mode, opt-in to complete checking
    ]
)

// Once ready:
.target(
    name: "MyFeature",
    swiftSettings: [.swiftLanguageMode(.v6)]
)
```

In Xcode build settings: `SWIFT_STRICT_CONCURRENCY = complete` during migration, then flip `SWIFT_VERSION` (language mode) to 6 per-target once clean.

## Common diagnostics and fixes

### "Sending value of non-Sendable type 'X' risks causing data races"

Appears when a non-`Sendable` value crosses an isolation boundary without `sending` and without being provably disconnected.

```swift
final class Session { var token: String }   // not Sendable

func upload(_ session: Session) async {
    Task { print(session.token) }   // error: Session is not Sendable
}
```

Fix by making the type `Sendable` (if it's safe — immutable, or locked), or by taking it as `sending` if it's a one-shot transfer, or by extracting only the `Sendable` data you actually need before crossing:

```swift
func upload(_ session: Session) async {
    let token = session.token   // extract the Sendable String
    Task { print(token) }
}
```

### "Call to main actor-isolated instance method in a synchronous nonisolated context"

You're calling `@MainActor` code from a context the compiler can't prove is on the main actor.

```swift
@MainActor final class ViewModel { func refresh() {} }

struct Coordinator {
    let viewModel: ViewModel
    func start() {
        viewModel.refresh()   // error: refresh() is main-actor-isolated
    }
}
```

Fix: make the caller `@MainActor` too, or call it from an async context with `await`:

```swift
struct Coordinator {
    let viewModel: ViewModel
    @MainActor func start() {
        viewModel.refresh()   // fine now — Coordinator.start() is main-actor-isolated
    }
}
```

### "Capture of 'self' with non-sendable type 'X' in a `@Sendable` closure"

A `@Sendable` closure (e.g., passed to `Task.detached`, or a completion handler typed `@Sendable`) captures `self`, and `self`'s type isn't `Sendable`.

```swift
final class Downloader {   // not Sendable
    func start() {
        Task.detached { self.finish() }   // error
    }
}
```

Fix: make the type `Sendable` (actor, or locked `@unchecked Sendable`), avoid `Task.detached` in favor of plain `Task { }` (which doesn't require the closure to be `@Sendable` when it inherits the caller's isolation), or extract only the data the closure needs.

### "Non-sendable type 'X' returned by call to actor-isolated function cannot cross actor boundary"

An actor method hands back a non-Sendable reference type to a caller outside the actor.

```swift
actor Cache {
    private var storage: [String: MutableBox] = [:]
    func value(for key: String) -> MutableBox? { storage[key] }   // error if MutableBox isn't Sendable
}
```

Fix: return a `Sendable` snapshot instead of the live mutable reference, or make the stored type `Sendable`/immutable.

### "Static property 'shared' is not concurrency-safe because it is nonisolated global shared mutable state"

Classic singleton pattern flagged under strict concurrency:

```swift
final class Logger {
    static let shared = Logger()   // error if Logger has mutable state and isn't Sendable
}
```

Fix: make the singleton's type `Sendable` (immutable, actor, or locked), or isolate the singleton to a global actor:

```swift
@MainActor
final class Logger {
    static let shared = Logger()   // fine: isolated to MainActor, accessed only from there
}
```

### "Actor-isolated property 'X' can not be referenced from a non-isolated context"

Direct property access on an actor from outside without `await`.

```swift
actor Store { var count = 0 }
let store = Store()
print(store.count)   // error
```

Fix: `await` it (`print(await store.count)`), or if only occasional reads are needed from many places, expose a `nonisolated` computed snapshot backed by a `Sendable` value that's updated inside the actor.

## Fixing warnings incrementally without disabling checks

Don't reach for `@unchecked Sendable` or `nonisolated(unsafe)` as a first move. `nonisolated(unsafe)` exists for narrow, justified cases (e.g., a property only ever mutated before any concurrent access begins, like a lazy one-time cache) — it suppresses the check for that one property, not the whole type, and still requires you to hand-verify safety:

```swift
final class Metrics: Sendable {
    nonisolated(unsafe) private var _cachedReport: Report?   // manually verified: written once, before sharing
}
```

Use it sparingly and comment the invariant, same discipline as `@unchecked Sendable`.

## Xcode warnings vs. errors

Until you commit to Swift 6 language mode, complete-level strict concurrency issues show as **warnings** — build succeeds, but treat them as a backlog to burn down, not noise to ignore. A useful gate: fail CI on new strict-concurrency warnings (diff-based) even before flipping the whole module to Swift 6, so the backlog doesn't grow while you're paying it down.
