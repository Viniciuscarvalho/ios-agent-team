# Async testing and waiting

Swift Testing's `@Test` functions can be `async` directly — no `expectation`/`wait(for:timeout:)` ceremony from XCTest is needed for code that's already `async`.

## Testing `async` functions directly

```swift
@Test func test_fetchUser_validID_returnsUser() async throws {
    let user = try await userService.fetchUser(id: 42)
    #expect(user.id == 42)
}
```

Just `await` the call under test. If it can fail, mark the test `throws` and let the error propagate — or use `#expect(throws:)` to assert a specific failure (see `expectations.md`):

```swift
@Test func test_fetchUser_networkFailure_throwsNetworkError() async {
    await #expect(throws: NetworkError.self) {
        try await userService.fetchUser(id: -1)
    }
}
```

## Testing `AsyncSequence` and streams

Iterate directly with `for await` and collect results, or assert on the first N values:

```swift
@Test func test_priceUpdates_afterThreeTicks_reflectsLatestPrice() async {
    let stream = PriceFeed(initial: 100).updates

    var receivedPrices: [Double] = []
    for await price in stream.prefix(3) {
        receivedPrices.append(price)
    }

    #expect(receivedPrices.count == 3)
}
```

For an `AsyncThrowingStream`, wrap the loop in a `throws` test and let `try await` propagate failures naturally.

## Testing callback-based / delegate-based APIs with `confirmation`

When the code under test is not `async` itself but reports completion via a closure, delegate method, or notification, use `confirmation` instead of a manual semaphore or `DispatchSemaphore`:

```swift
@Test func test_downloadManager_onCompletion_invokesCallbackOnce() async {
    await confirmation("Download completion callback fires") { confirm in
        let manager = DownloadManager()
        manager.download(url: testFileURL) { _ in
            confirm()
        }
        try? await Task.sleep(for: .seconds(1)) // only where the API genuinely offers no async entry point
    }
}
```

`confirmation` fails the test if `confirm()` isn't called the expected number of times (default: exactly once) by the time the trailing closure returns. Pass `expectedCount:` for APIs that call back multiple times:

```swift
@Test func test_eventBus_threeSubscribersOnPublish_notifiesEachOnce() async {
    await confirmation("Each subscriber notified", expectedCount: 3) { confirm in
        let bus = EventBus()
        for _ in 0..<3 {
            bus.subscribe { _ in confirm() }
        }
        bus.publish(Event.tap)
    }
}
```

Prefer wrapping the callback API in an `async` adapter (via `withCheckedContinuation`/`withCheckedThrowingContinuation`) at the call site under test when you control that code — then you're back to the direct `await` pattern above, and `confirmation` is only needed for genuinely multi-fire or fire-and-forget callbacks.

## Task-based tests

If the code under test launches its own `Task`, don't `await` the test function past the point the production code returns — instead, drive it through an externally observable effect (a published property, a value written to a repository) that you can await, or inject a way to await the internal task from the test:

```swift
@Test func test_viewModel_load_publishesItemsAfterFetchCompletes() async {
    let viewModel = ItemsViewModel(repository: FakeRepository(items: [.mock]))
    await viewModel.load()               // awaits the ViewModel's own internal Task
    #expect(viewModel.items.isEmpty == false)
}
```

If `load()` doesn't expose an awaitable form, that's a design gap in the production code, not a testing problem — see `performance-and-best-practices.md` on awkward-to-test code being a design smell. Expose an `async` entry point rather than adding a `Task.sleep` around a fire-and-forget call.

## Avoid sleeps and polling

```swift
// Avoid — flaky by construction, and slow even when it passes
@Test func test_cache_afterExpiry_evictsEntry() async throws {
    cache.store("value", forKey: "key", ttl: .seconds(1))
    try await Task.sleep(for: .seconds(2))
    #expect(cache.value(forKey: "key") == nil)
}
```

```swift
// Prefer — inject a controllable clock instead of waiting on wall-clock time
@Test func test_cache_afterExpiry_evictsEntry() {
    let clock = TestClock()
    let cache = Cache(clock: clock)
    cache.store("value", forKey: "key", ttl: .seconds(1))

    clock.advance(by: .seconds(2))

    #expect(cache.value(forKey: "key") == nil)
}
```

If a real wait is unavoidable (e.g. verifying a genuine timeout against a live dependency you don't control), pair it with `.timeLimit()` (see `traits-and-tags.md`) so a hang fails fast in CI instead of consuming the entire CI timeout budget.

Never poll with a `while !condition { try await Task.sleep(...) }` loop to "wait until ready" — it's nondeterministic and slow. Prefer `confirmation` (event-driven) or an injectable clock (time-driven) so the test's pass/fail path doesn't depend on how fast the CI machine happens to be that day.
