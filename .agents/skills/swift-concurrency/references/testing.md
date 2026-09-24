# Testing Async and Actor Code with Swift Testing

## Async tests are the default shape, not an add-on

Swift Testing's `@Test` functions can be `async throws` directly — no special annotation needed, and no `expectation`/`wait` ceremony for code that's already `async`.

```swift
import Testing

@Test
func userProfile_afterFetch_containsExpectedName() async throws {
    let repository = ProfileRepository(client: StubNetworkClient(response: .validProfile))
    let profile = try await repository.fetchProfile(id: "42")
    #expect(profile.name == "Ada Lovelace")
}
```

`#expect` and `#require` work identically in async tests as sync ones. `#require` throws and aborts the test on failure — use it for preconditions the rest of the test depends on:

```swift
@Test
func cache_afterStore_returnsStoredValue() async throws {
    let cache = ImageCache()
    await cache.store(sampleImage, for: sampleURL)
    let cached = try #require(await cache.image(for: sampleURL))
    #expect(cached.size == sampleImage.size)
}
```

## Testing actors

Call actor-isolated methods with `await`, same as production code. No special mocking is needed purely for isolation — actors are already testable through their async API.

```swift
@Test
func inventoryStore_reserve_decrementsStock() async throws {
    let store = InventoryStore()
    await store.restock(.init("ABC"), quantity: 5)
    try await store.reserve(.init("ABC"), quantity: 3)
    #expect(await store.quantity(for: .init("ABC")) == 2)
}
```

### Testing reentrancy hazards

To actually exercise a reentrancy bug, force two calls to overlap around a suspension point using a `TaskGroup`:

```swift
@Test
func ticketBooth_concurrentSells_neverOversells() async throws {
    let booth = TicketBooth(totalTickets: 1)
    let results = await withTaskGroup(of: Bool.self) { group in
        for _ in 0..<10 {
            group.addTask { (try? await booth.sell()) != nil }
        }
        return await group.reduce(into: []) { $0.append($1) }
    }
    #expect(results.filter { $0 }.count == 1)   // exactly one sale should succeed
}
```

## Testing `@MainActor` code

If the type under test is `@MainActor`-isolated, mark the test `@MainActor` too (or the whole suite) rather than sprinkling `await MainActor.run` calls:

```swift
@Suite(.serialized)
@MainActor
struct FeedViewModelTests {
    @Test
    func refresh_onSuccess_populatesPosts() async throws {
        let viewModel = FeedViewModel(service: StubFeedService(posts: [.sample]))
        await viewModel.refresh()
        #expect(viewModel.posts == [.sample])
    }
}
```

`.serialized` on the suite is worth considering when tests share `@MainActor` state or a singleton — Swift Testing parallelizes across suites by default, and main-actor-isolated shared state can otherwise interleave unexpectedly between tests in the same suite (individual `@Test` functions within one type still run in an order the runtime chooses unless serialized).

## Testing `AsyncStream`/`AsyncSequence`-based code

Collect the stream into an array when you need to assert on the full sequence, bounding it against an expected count or using cancellation to avoid hanging forever on an infinite producer:

```swift
@Test
func locationTracker_updates_emitsInOrder() async throws {
    let tracker = FakeLocationTracker(updates: [.sampleA, .sampleB])
    var received: [CLLocation] = []
    for await location in tracker.locationUpdates() {
        received.append(location)
        if received.count == 2 { break }   // stop once we have what we expect
    }
    #expect(received == [.sampleA, .sampleB])
}
```

## `confirmation` for callback-based code you haven't wrapped yet

When testing code that still uses completion handlers directly (e.g., verifying a delegate call happens), `confirmation` bridges callback-style verification into an async test without manual expectations:

```swift
@Test
func locationManager_onUpdate_notifiesDelegate() async throws {
    await confirmation() { confirm in
        let sut = makeLocationManager(onUpdate: { _ in confirm() })
        sut.simulateLocationUpdate(.sample)
    }
}
```

`confirmation(expectedCount:)` asserts an exact number of calls, catching both "never called" and "called too many times" in one assertion.

## Avoid real time delays in tests

Don't use `Task.sleep` in a test to "wait for" async work to settle — it makes tests slow and flaky under load. Prefer:

- Awaiting the actual async call/`Task` handle you're testing, rather than sleeping and hoping it's done.
- Injecting a fake clock/scheduler for code that depends on `Task.sleep`/timers, so tests can advance time deterministically instead of sleeping in wall-clock time.

```swift
protocol Clock: Sendable {
    func sleep(for duration: Duration) async throws
}

struct InstantClock: Clock {
    func sleep(for duration: Duration) async throws { /* no-op in tests */ }
}
```

## Timeouts for hang-prone tests

Use `.timeLimit` on tests that exercise code with real potential to hang (e.g., anything touching cancellation or a custom `AsyncSequence`), so a bug that causes an infinite `await` fails the test suite instead of hanging CI:

```swift
@Test(.timeLimit(.minutes(1)))
func downloadStream_onCancellation_terminatesPromptly() async throws { ... }
```

## Common pitfalls

- **Polling/sleeping to "wait for" async state to settle** instead of awaiting the specific handle that signals completion.
- **Forgetting `@MainActor` on a test for `@MainActor` code**, leading to compiler errors or (if bridged incorrectly) accidental cross-actor calls.
- **Testing an actor's internals via reflection/private access** instead of through its async public API — actors are meant to be tested black-box, same as any other encapsulated type.
- **Not bounding infinite `AsyncSequence` consumption in a test** — always have an explicit exit condition (`break` on count, or a `.timeLimit` trait) when testing a stream that doesn't naturally terminate.
