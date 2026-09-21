# AsyncSequence and AsyncStream

## Consuming an AsyncSequence

`for await` iterates any `AsyncSequence`, suspending at each element until the next one is available:

```swift
for try await line in fileHandle.bytes.lines {
    process(line)
}
```

Break out with `break`/`return` as usual; the sequence's iterator is responsible for cleaning up (cancelling underlying work) when abandoned mid-iteration — well-behaved implementations tie that cleanup to the iterator's lifetime or a cancellation handler, not to reaching the end of the sequence.

## `AsyncSequence`'s modern shape (SE-0421)

As of Swift 6, `AsyncSequence` declares `Element` and `Failure` as **primary associated types**, which lets you write constrained existentials and opaque return types that actually say something useful:

```swift
protocol AsyncSequence<Element, Failure> {
    associatedtype Element
    associatedtype Failure: Error
    associatedtype AsyncIterator: AsyncIteratorProtocol where AsyncIterator.Element == Element
    func makeAsyncIterator() -> AsyncIterator
}
```

This means you can now write:

```swift
func liveScores() -> some AsyncSequence<Score, Never> { ... }
func liveScores() -> any AsyncSequence<Score, Never> { ... }
```

instead of leaking an opaque, unconstrained `some AsyncSequence` that told callers nothing about what element type to expect.

`Failure` also enables **typed throws** on iteration: an `AsyncSequence` whose `Failure` is `Never` is statically known to never throw, so `for await` over it doesn't need `try`. `AsyncIteratorProtocol.next()` correspondingly gained a typed-throws overload:

```swift
protocol AsyncIteratorProtocol<Element, Failure> {
    mutating func next(isolation actor: isolated (any Actor)?) async throws(Failure) -> Element?
}
```

The `isolation` parameter (defaulted via `#isolation`) lets the iterator run on the caller's actor when appropriate, avoiding an unnecessary hop for sequences that don't need their own isolation domain.

## `AsyncStream` — bridging push-based APIs

`AsyncStream` converts a callback/delegate/notification-style API into something consumable with `for await`. Use it whenever a source can produce zero-or-more values over time, not just one.

```swift
final class LocationTracker: NSObject, CLLocationManagerDelegate {
    func locationUpdates() -> AsyncStream<CLLocation> {
        AsyncStream { continuation in
            let manager = CLLocationManager()
            manager.delegate = self
            self.continuation = continuation
            manager.startUpdatingLocation()

            continuation.onTermination = { _ in
                manager.stopUpdatingLocation()
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        locations.forEach { continuation?.yield($0) }
    }
}
```

Consume it like any other sequence:

```swift
for await location in tracker.locationUpdates() {
    updateMap(with: location)
}
```

### Buffering policy

`AsyncStream` buffers yielded values if the consumer isn't ready yet. Control this explicitly for high-frequency producers to avoid unbounded memory growth:

```swift
AsyncStream(bufferingPolicy: .bufferingNewest(1)) { continuation in
    // only the most recent unconsumed value is kept
}
```

Options: `.unbounded` (default), `.bufferingNewest(n)`, `.bufferingOldest(n)`.

### `AsyncThrowingStream`

Use when the underlying source can fail:

```swift
func downloadProgress(for url: URL) -> AsyncThrowingStream<Double, Error> {
    AsyncThrowingStream { continuation in
        let task = downloader.start(url) { progress in
            continuation.yield(progress)
        } completion: { result in
            switch result {
            case .success: continuation.finish()
            case .failure(let error): continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in task.cancel() }
    }
}
```

### `AsyncStream.makeStream` for external producers

When you need the continuation available outside the closure that creates the stream (e.g., stored as a property to `yield` from multiple call sites):

```swift
let (stream, continuation) = AsyncStream.makeStream(of: Event.self, bufferingPolicy: .unbounded)
self.eventContinuation = continuation
// later, from anywhere: eventContinuation.yield(event)
```

## Writing a custom `AsyncSequence`

Reach for a custom conformance (over `AsyncStream`) when you need value semantics, multiple independent iterators, or algorithmic transformation logic rather than just bridging a callback.

```swift
struct Debounced<Base: AsyncSequence>: AsyncSequence where Base.Element: Sendable {
    typealias Element = Base.Element
    let base: Base
    let interval: Duration

    struct AsyncIterator: AsyncIteratorProtocol {
        var baseIterator: Base.AsyncIterator
        let interval: Duration

        mutating func next() async rethrows -> Base.Element? {
            guard let first = try await baseIterator.next() else { return nil }
            try await Task.sleep(for: interval)
            return first
        }
    }

    func makeAsyncIterator() -> AsyncIterator {
        AsyncIterator(baseIterator: base.makeAsyncIterator(), interval: interval)
    }
}
```

## Cancellation

Iterating with `for await` inside a `Task` stops automatically when that task is cancelled — the next call to `next()` on most standard sequences (including `AsyncStream` and `Task.sleep`-based ones) throws or returns `nil` promptly. Custom iterators should check `Task.checkCancellation()` inside long-running `next()` implementations that don't already suspend on a cancellable primitive.

## Common pitfalls

- **Never setting `onTermination`** on an `AsyncStream` wrapping a subscription — the underlying subscription (and any resources it holds) outlives every consumer. See also `memory-management.md`.
- **Using `AsyncStream` when a single value (not a stream of values) is what you actually have** — that's just an `async` function; don't overcomplicate with a stream of one element.
- **Unbounded buffering on a fast producer with a slow/absent consumer** — set an explicit `bufferingPolicy`.
- **Multiple concurrent consumers of one `AsyncStream`** — each element is delivered to only one iterator; `AsyncStream` is not a broadcast/multicast primitive. If you need fan-out, wrap distribution logic explicitly (e.g., one actor holding multiple continuations).
