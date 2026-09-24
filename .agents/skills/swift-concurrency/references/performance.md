# Concurrency Performance Pitfalls

## Actor contention

An actor processes one call at a time. If many callers hit the same actor concurrently, they queue up on its serial executor — the actor becomes a bottleneck even though the *work itself* could parallelize.

```swift
actor ImageCache {
    private var storage: [URL: UIImage] = [:]
    func image(for url: URL) -> UIImage? { storage[url] }
    func store(_ image: UIImage, for url: URL) { storage[url] = image }
}
```

If 50 concurrent downloads all call `cache.store(...)` as soon as they finish, they serialize on the actor even though the downloads themselves ran in parallel — usually fine, since a dictionary write is fast, but if the actor does heavier work per call (e.g., re-encoding, disk I/O), that heavier work now runs one-at-a-time regardless of how much parallelism the callers have.

**Fix:** keep actor-isolated methods short — do expensive, parallelizable work *outside* the actor and only touch actor state for the final, cheap read/write.

```swift
func loadAndCache(_ url: URL) async throws -> UIImage {
    let data = try await URLSession.shared.data(from: url).0   // parallel-friendly, off the actor
    let image = UIImage(data: data)!                            // decode off the actor too
    await cache.store(image, for: url)                           // brief, isolated write only
    return image
}
```

## Excessive actor hopping

Every call across an actor boundary is a potential suspension and a scheduling round-trip. Code that ping-pongs between two actors in a tight loop pays that cost repeatedly.

```swift
// Slow: hops to `store` on every iteration.
for id in ids {
    let item = await store.item(for: id)
    process(item)
}

// Faster: one hop, batch read.
let items = await store.items(for: ids)
for item in items { process(item) }
```

Batch actor APIs (accept/return collections) instead of one-item-at-a-time APIs whenever callers loop over many items.

## `@MainActor` overuse

Marking types `@MainActor` "to be safe" forces every call into them to hop onto the main thread, even from background work that has no UI dependency. Isolate only what actually touches UI state; keep networking, parsing, and business logic off the main actor and hand only the final, display-ready result to `@MainActor` code.

```swift
// Unnecessary: parsing has no UI dependency, but @MainActor forces it onto the main thread.
@MainActor
func parseAndDisplay(_ data: Data) throws {
    let feed = try JSONDecoder().decode(Feed.self, from: data)   // pure CPU work, main-thread-bound for no reason
    self.feed = feed
}

// Better: parse off the main actor, only hop for the assignment.
func parseAndDisplay(_ data: Data) async throws {
    let feed = try JSONDecoder().decode(Feed.self, from: data)   // runs on whatever isolation the caller has
    await MainActor.run { self.feed = feed }
}
```

## Task creation overhead

Tasks are cheaper than threads, but not free — creating thousands of short-lived tasks for trivial work (e.g., one `Task` per array element for a sub-millisecond operation) adds scheduling overhead that can exceed the work itself.

```swift
// Overkill for cheap, CPU-bound work — scheduling overhead dominates.
let results = await withTaskGroup(of: Int.self) { group in
    for n in 0..<10_000 { group.addTask { n * n } }
    return await group.reduce(into: []) { $0.append($1) }
}

// Better: do the cheap work synchronously, reserve TaskGroup for genuinely
// independent, non-trivial units of work (network calls, file I/O, heavy computation).
let results = (0..<10_000).map { $0 * $0 }
```

## Priority inversion and its automatic mitigation

If a high-priority task awaits a result from a lower-priority task, the runtime automatically escalates the lower-priority task's priority for the duration. You generally don't need to manually manage this — but avoid *creating* the inversion in the first place by not off-loading user-visible work onto `.background`-priority tasks that a `.userInitiated` task then has to wait on.

## Avoiding unnecessary `Task` wrapping around synchronous work

```swift
// Adds a scheduling hop for zero benefit.
func doubled(_ x: Int) async -> Int {
    await Task { x * 2 }.value
}

// Just call it.
func doubled(_ x: Int) -> Int { x * 2 }
```

## Measuring: Instruments' Swift Concurrency template

Use the **Swift Concurrency** Instruments template to see actual task lifetimes, actor contention (time spent waiting to enter an actor vs. time spent running inside it), and thread-pool utilization. Key signals to look for:

- Tasks with long "waiting to run" spans on an otherwise idle pool → likely blocked on a busy actor or a synchronous blocking call starving the pool (see `threading.md`).
- One actor showing up as a hotspot with many queued callers → candidate for splitting into finer-grained actors, or shrinking what runs inside its isolated methods.
- Large numbers of very-short-lived tasks → candidate for batching or removing unnecessary `Task` wrapping.

## Common pitfalls

- **Doing expensive work inside an actor method that didn't need isolation for most of its body** — isolate only the final state mutation.
- **One global actor for unrelated subsystems** ("just use `@MainActor` for everything" or a single custom global actor for all background work) — creates artificial serialization between unrelated work; use separate actors per independent resource.
- **`TaskGroup` for embarrassingly cheap, synchronous work** — the overhead of scheduling can dwarf the work.
- **Not batching actor APIs** when callers loop — turn N hops into 1.
