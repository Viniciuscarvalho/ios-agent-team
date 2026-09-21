# Actors, Isolation, and @MainActor

## What an actor guarantees

An `actor` is a reference type whose mutable state can only be accessed by one task at a time, synchronously, from *inside* the actor. From outside, every access to actor-isolated state must go through `await`, because the actor might currently be running a different task's work.

```swift
actor InventoryStore {
    private var stock: [SKU: Int] = [:]

    func reserve(_ sku: SKU, quantity: Int) throws {
        guard (stock[sku] ?? 0) >= quantity else { throw InventoryError.insufficientStock }
        stock[sku, default: 0] -= quantity
    }

    func quantity(for sku: SKU) -> Int {
        stock[sku] ?? 0
    }
}

// From outside the actor:
try await inventoryStore.reserve(.init("ABC123"), quantity: 2)
```

Inside `reserve` and `quantity`, code runs synchronously and needs no `await` — the actor guarantees exclusive access to `stock` for the duration of that call. `await` is only required at the *call site*, when crossing into the actor from outside.

## Isolation, not thread affinity

An actor is not "a dedicated thread." Its isolated code runs on whatever cooperative-pool thread its serial executor picks for that particular call — different calls to the same actor can run on different threads (never concurrently, always one at a time). Don't write code that depends on `Thread.current` being stable across two calls to the same actor.

## Reentrancy

Actors are **reentrant**: if actor-isolated code awaits something, another task can enter the actor and run *while the first call is suspended*. This is easy to get wrong when state is checked before an `await` and assumed still valid after it.

```swift
actor TicketBooth {
    private var soldOut = false

    // BUG: reentrancy hazard.
    func sell() async throws -> Ticket {
        guard !soldOut else { throw TicketError.soldOut }
        let ticket = try await mintTicket()   // suspends here
        // Another call to sell() could have run to completion during the await above,
        // possibly setting soldOut = true — but this call doesn't re-check.
        return ticket
    }
}
```

Fix by re-validating state after every suspension point, or by restructuring so the check-then-act sequence has no `await` in between:

```swift
actor TicketBooth {
    private var soldOut = false

    func sell() async throws -> Ticket {
        guard !soldOut else { throw TicketError.soldOut }
        let ticket = try await mintTicket()
        guard !soldOut else { throw TicketError.soldOut }   // re-check post-suspension
        return ticket
    }
}
```

Reentrancy is a feature, not a bug — it's what prevents actors from deadlocking on recursive or mutually-awaiting calls — but it means **no code inside an actor method can assume the actor's state is unchanged across an `await`.**

## `nonisolated`

Mark members `nonisolated` when they don't touch actor-isolated mutable state — most commonly, `let` constants and pure functions:

```swift
actor AnalyticsBatcher {
    nonisolated let sessionID = UUID()

    nonisolated func label(for event: Event) -> String {
        "\(event.name)-\(sessionID)"
    }

    private var buffer: [Event] = []   // isolated
    func add(_ event: Event) { buffer.append(event) }
}
```

`nonisolated` members can be called without `await` from anywhere, since they never touch the actor's protected state.

## Isolated parameters

A function can accept an explicit actor parameter and run isolated to it, without being a method on that actor:

```swift
func audit(_ store: isolated InventoryStore, sku: SKU) {
    // synchronous access to store's isolated state, no await needed here
    print(store.quantity(for: sku))
}
```

This is mostly used by framework/library authors bridging APIs into an existing actor's isolation; app code rarely needs it directly.

## `@MainActor`

`@MainActor` is a specific **global actor** whose executor always runs on the main thread. Apply it to any type whose state backs UI.

```swift
@MainActor
final class FeedViewModel: ObservableObject {
    @Published private(set) var posts: [Post] = []
    @Published private(set) var isLoading = false

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        posts = try? await feedService.fetchLatest() ?? posts
    }
}
```

Because the whole type is `@MainActor`, every property and method is main-thread-isolated by default — no manual `DispatchQueue.main.async` needed, and the compiler rejects any attempt to touch `posts` from a background context without `await`.

Prefer isolating the **whole type** over sprinkling `@MainActor` on individual methods — mixed isolation within one type is a common source of "why do I need `await` here but not there" confusion.

### Calling off the main actor from `@MainActor` code

```swift
@MainActor
final class FeedViewModel: ObservableObject {
    private let feedService: FeedService   // not main-actor-isolated

    func refresh() async {
        let posts = try? await feedService.fetchLatest()   // hops off main actor, then back
        self.posts = posts ?? []
    }
}
```

`feedService.fetchLatest()` runs on whatever isolation `FeedService` has (often none — a plain `Sendable` struct/class using async networking). The `await` marks both the hop off the main actor and the hop back once the result is ready.

## Global actors beyond `@MainActor`

You can define custom global actors for cross-cutting isolation domains shared by many otherwise-unrelated types:

```swift
@globalActor
actor DatabaseActor {
    static let shared = DatabaseActor()
}

@DatabaseActor
final class UserRepository {
    func save(_ user: User) throws { /* isolated to DatabaseActor */ }
}
```

Use a custom global actor when multiple independent types must serialize against the *same* resource (e.g., a single SQLite connection) — it gives you actor-style exclusivity without forcing every caller to hold a reference to one specific actor instance.

## Common pitfalls

- **Treating an actor like a lock around a single call** without accounting for reentrancy across `await` inside that call.
- **Isolating individual methods with `@MainActor` instead of the whole type**, leading to inconsistent isolation and needless `await`s between sibling methods.
- **Calling actor-isolated methods from `deinit`** — `deinit` can't be isolated or `async`, so you cannot `await` an actor call there. Cancel/tear down using non-isolated, synchronous mechanisms (e.g., `Task.cancel()`, `nonisolated` cleanup) instead.
- **Assuming synchronous-looking code inside an actor is exclusive end-to-end** when it contains an `await` — it isn't, per reentrancy.
