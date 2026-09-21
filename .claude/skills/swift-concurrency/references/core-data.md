# Core Data and Swift Concurrency

## The core tension

`NSManagedObjectContext` and `NSManagedObject` are **not** `Sendable`, and Core Data has its own concurrency model — context confinement — that predates Swift Concurrency and is enforced at runtime (crashes/assertions), not by the Swift compiler. Every access to a managed object or its context must happen on that context's own queue, via `perform`/`performAndWait`, regardless of how you got there.

Never pass an `NSManagedObject` or `NSManagedObjectContext` across an `await` boundary and keep using it on "the other side" — that's exactly the pattern Core Data's confinement model forbids, and Swift Concurrency won't catch it for you since these types predate `Sendable` and are typically imported as implicitly `@preconcurrency`/unchecked.

## Bridging `perform` into async/await

`NSManagedObjectContext.perform(schedule:_:)` (available since the context confinement APIs gained async support) lets you `await` a block of Core Data work instead of nesting callback closures:

```swift
extension NSManagedObjectContext {
    func performAsync<T>(_ block: @escaping () throws -> T) async throws -> T {
        try await perform {
            try block()
        }
    }
}

func fetchAllOrders(in context: NSManagedObjectContext) async throws -> [OrderSummary] {
    try await context.perform {
        let request = Order.fetchRequest()
        let orders = try context.fetch(request)
        // Convert to a Sendable value type INSIDE perform, before returning.
        return orders.map { OrderSummary(id: $0.id, total: $0.total) }
    }
}
```

The critical discipline: **extract plain, `Sendable` value types from managed objects before the `perform` closure returns.** Never return an `NSManagedObject` from an async function — the caller has no safe way to touch it, since it's still confined to the context's queue and the caller is on a different isolation domain.

## Background writes

```swift
func createOrder(items: [CartItem], in container: NSPersistentContainer) async throws -> OrderID {
    let backgroundContext = container.newBackgroundContext()
    return try await backgroundContext.perform {
        let order = Order(context: backgroundContext)
        order.items = NSSet(array: items.map { $0.toManagedItem(in: backgroundContext) })
        try backgroundContext.save()
        return OrderID(order.id)
    }
}
```

Each call gets its own background context here; for repeated writes, keep one long-lived background context (owned by a dedicated type — see below) rather than creating a new one per call.

## A `ModelActor`-style wrapper

Wrapping a background `NSManagedObjectContext` in an `actor` gives you Swift Concurrency's isolation checking on top of Core Data's own confinement — the actor ensures only one Swift task touches your wrapper's API at a time, matching the context's single-queue confinement one-to-one.

```swift
actor OrderRepository {
    private let context: NSManagedObjectContext

    init(container: NSPersistentContainer) {
        context = container.newBackgroundContext()
        context.automaticallyMergesChangesFromParent = true
    }

    func fetchOrders() async throws -> [OrderSummary] {
        try await context.perform {
            try self.context.fetch(Order.fetchRequest()).map(OrderSummary.init)
        }
    }

    func createOrder(items: [CartItem]) async throws -> OrderID {
        try await context.perform {
            let order = Order(context: self.context)
            order.apply(items)
            try self.context.save()
            return OrderID(order.id)
        }
    }
}
```

Note that `context.perform` is still doing the real confinement work here (hopping to Core Data's own private queue); the actor's job is purely to serialize *callers* and to give the rest of your Swift code a `Sendable`-friendly, async-native API surface. Don't assume the actor alone replaces `perform` — you still need it, because Core Data's queue is not the actor's executor.

## Observing changes: `NSPersistentContainer` + `AsyncStream`

Bridge `NSManagedObjectContextDidSave`/`NSManagedObjectContextObjectsDidChange` notifications into an `AsyncStream` for consumers that want to react as a sequence:

```swift
extension OrderRepository {
    nonisolated func orderChanges() -> AsyncStream<Void> {
        AsyncStream { continuation in
            let observer = NotificationCenter.default.addObserver(
                forName: .NSManagedObjectContextDidSave,
                object: nil,
                queue: nil
            ) { _ in continuation.yield() }

            continuation.onTermination = { _ in
                NotificationCenter.default.removeObserver(observer)
            }
        }
    }
}
```

## `@FetchRequest` and SwiftUI

`@FetchRequest` already runs on the main context and integrates with SwiftUI's own update cycle — don't wrap it in `async`/`await`; it's synchronous by design and tied to the main actor's view context. Reserve actor-wrapped repositories for background work (imports, exports, sync) that shouldn't run on the main context.

## Main context and `@MainActor`

The view context (`container.viewContext`) is documented by Apple to be confined to the main queue — treat it as conceptually `@MainActor`-isolated, and only call it from `@MainActor` code:

```swift
@MainActor
final class OrderListViewModel: ObservableObject {
    @Published var orders: [OrderSummary] = []
    private let viewContext: NSManagedObjectContext   // container.viewContext

    func refresh() {
        orders = try? viewContext.fetch(Order.fetchRequest()).map(OrderSummary.init) ?? orders
    }
}
```

No `await` is needed here because both the view model and the view context agree on being main-thread-confined — but that agreement is a manual convention Core Data expects you to uphold, not something the compiler verifies for you the way actor isolation is.

## Common pitfalls

- **Returning `NSManagedObject` from an async function** — extract `Sendable` value types inside `perform` instead.
- **Calling `context.fetch`/`.save()` outside a `perform` block** because you're "already inside an actor" — the actor's isolation doesn't substitute for Core Data's own queue confinement; you still need `perform`.
- **Creating a new background context per operation** under load — prefer one long-lived context per actor/repository, matching Apple's guidance to keep a small, stable number of contexts.
- **Mixing `viewContext` access between `@MainActor` code and background tasks** — keep `viewContext` strictly on the main actor; use a separate background context (wrapped in its own actor) for everything else.
