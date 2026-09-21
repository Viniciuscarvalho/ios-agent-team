# Memory Management in Async Contexts

## `Task { }` and `self` capture

A `Task { }` created inside an instance method captures `self` strongly by default, same as any closure. Whether that's a problem depends on the task's lifetime relative to the owning object's.

### When strong capture is fine

If the task is short-lived and tied to the view/object's own lifecycle (the common case in SwiftUI view models), strong capture is correct and `[weak self]` is noise:

```swift
@MainActor
final class ProfileViewModel {
    func loadOnAppear() {
        Task {
            self.profile = try? await fetchProfile()   // fine: task finishes quickly, tied to this VM
        }
    }
}
```

The task holds `self` alive only until it completes; if the view model would otherwise have been deallocated, the task simply keeps it alive a little longer, which is usually the desired behavior (you want the fetch to finish and update state, not vanish mid-flight).

### When to use `[weak self]`

Use weak capture when the task is long-running, detached, or stored and potentially never cancelled — situations where keeping `self` alive indefinitely would be a leak or would perform unwanted work after the owner should have gone away.

```swift
final class LogUploader {
    func startPeriodicFlush() {
        Task.detached { [weak self] in
            while true {
                try await Task.sleep(for: .seconds(60))
                guard let self else { return }
                await self.flush()
            }
        }
    }
}
```

Without `[weak self]` here, `LogUploader` would never deallocate — the infinite loop holds a strong reference forever.

## Retain cycles between actors and closures

Actors are reference types; storing a closure on an actor that captures the actor itself strongly creates the same cycle risk as classes:

```swift
actor DownloadCoordinator {
    private var onProgress: (@Sendable (Double) -> Void)?

    func observe(_ handler: @Sendable @escaping (Double) -> Void) {
        onProgress = handler
    }
}

// Caller-side cycle: capturing the coordinator in its own observer.
coordinator.observe { progress in
    Task { await coordinator.report(progress) }   // strong cycle if coordinator also retains this closure's owner
}
```

Break these the same way you would for classes: capture `[weak self]` in the closure passed in, not inside the actor's own storage.

## `AsyncStream` continuation leaks

An `AsyncStream.Continuation` that's never finished, and whose stream is never fully consumed, can leak the buffered elements and any captured state.

```swift
func events() -> AsyncStream<Event> {
    AsyncStream { continuation in
        let token = eventCenter.subscribe { event in
            continuation.yield(event)
        }
        continuation.onTermination = { _ in
            eventCenter.unsubscribe(token)   // essential: runs on cancellation OR normal termination
        }
    }
}
```

Always set `onTermination` when the continuation wraps an external subscription (notification observers, delegate registrations, socket listeners) — it's the async equivalent of `deinit` cleanup and is the single most common leak source in `AsyncStream`-wrapped APIs.

## Structured concurrency reduces leak surface, but doesn't eliminate it

`async let` and `TaskGroup` children are automatically cancelled and awaited when their scope exits, so structured concurrency mostly self-cleans. The leak risk concentrates in:

- Unstructured `Task { }` handles stored in a property and never cancelled in `deinit`.
- `Task.detached` work with no external cancellation hook.
- Closures captured by long-lived actors or singletons.

```swift
@MainActor
final class LiveTicker: ObservableObject {
    private var tickTask: Task<Void, Never>?

    func start() {
        tickTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                self?.tick += 1
            }
        }
    }

    deinit {
        tickTask?.cancel()
    }
}
```

Note `deinit` on a class can't be `@MainActor`-isolated and can't `await`, so cancellation from `deinit` must be a synchronous, non-isolated call — `Task.cancel()` is synchronous and safe to call from anywhere, which is why this pattern works.

## `weak` and `unowned` across suspension points

`unowned` (and `unowned(unsafe)`) assumes the referenced object outlives the reference with no runtime check (or a trapping check for plain `unowned`). Across an `await`, arbitrary time can pass and other code can run — an assumption that held synchronously ("the delegate always outlives the callback") is far more likely to be violated after a suspension. Default to `weak` in async closures unless you can prove the lifetime invariant still holds after suspension.

## Common pitfalls

- **Reflexive `[weak self]` on every `Task { }`**, adding optional-chaining noise to tasks that are already scoped to the owner's lifetime and complete quickly. Judge case by case — see the two subsections above.
- **Missing `onTermination` on `AsyncStream`** wrapping a subscription-based API — the subscription outlives every consumer.
- **Forgetting to cancel a stored `Task` in `deinit`** for classes that hold a repeating/looping task.
- **`unowned` capture in a closure that crosses an `await`** — the referenced object's lifetime is no longer guaranteed once you've suspended.
