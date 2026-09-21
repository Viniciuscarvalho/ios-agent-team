# Threading Model: The Cooperative Thread Pool

## How Swift Concurrency maps to threads

Swift Concurrency does not give every `Task` its own thread. Instead, the runtime maintains a **cooperative thread pool** sized roughly to the number of CPU cores. Tasks are scheduled onto pool threads by an **executor**; when a task suspends (hits an `await` that actually waits on something), it gives the thread back to the pool so another task can run on it.

This is fundamentally different from `DispatchQueue`, where the system can spin up many threads under contention (and did, historically, leading to thread explosion under heavy `DispatchQueue.global()` usage).

```
Task A ──awaits I/O──> suspends, thread returned to pool
Task B ──runs on freed thread──> ...
Task A ──I/O completes──> resumes, scheduled onto *some* pool thread (not necessarily the same one)
```

Because a task can resume on a different thread than it suspended on, **never assume thread identity across an `await`**. Code that relied on `Thread.current` or thread-local storage across a suspension point in GCD-based code will misbehave when ported to async/await — replace thread-local state with `@TaskLocal` or actor state.

## The cardinal rule: never block a cooperative pool thread

Because the pool is small and shared by all tasks in the process, a thread that blocks synchronously (rather than suspending) starves the whole pool.

```swift
// WRONG — blocks a cooperative pool thread; starves other tasks.
func badDelay() async {
    Thread.sleep(forTimeInterval: 1)
}

// RIGHT — suspends, thread returns to the pool.
func goodDelay() async throws {
    try await Task.sleep(for: .seconds(1))
}
```

Other blocking operations to avoid inside `async` functions:

- `DispatchSemaphore.wait()` / `NSCondition.wait()`
- Synchronous file I/O or network calls (`Data(contentsOf:)` on a remote URL, blocking socket reads)
- `NSLock.lock()` held for any non-trivial duration (brief, uncontended locks are fine; don't hold one across an `await` — see below)
- Calling a synchronous function that internally blocks on a `DispatchQueue.sync`

If you must call blocking, legacy synchronous code from an async context, isolate it deliberately:

```swift
func legacyBlockingCall() async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                continuation.resume(returning: try synchronousBlockingWork())
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }
}
```

This moves the blocking work to a GCD queue explicitly, keeping the cooperative pool free, at the cost of one extra thread hop.

## Executors

An **executor** decides which thread a piece of isolated code runs on next.

- The **global cooperative executor** backs plain `async` functions and non-actor `Task`s — work is distributed across the pool.
- Each **actor** has a **serial executor** that runs the actor's isolated code one piece at a time, on whichever pool thread is available (not a dedicated thread per actor).
- `@MainActor` is backed by the **main executor**, which always runs on the main thread — this is how `@MainActor` code stays UI-safe.

Custom executors (`SerialExecutor`, `TaskExecutor` from SE-0417/SE-0392) let you pin an actor to a specific queue (e.g., to interoperate with a pre-existing serial `DispatchQueue`-based subsystem) without opting out of structured concurrency:

```swift
final class LegacyQueueExecutor: SerialExecutor {
    private let queue = DispatchQueue(label: "com.app.legacy-subsystem")

    func enqueue(_ job: consuming ExecutorJob) {
        let unownedJob = UnownedJob(job)
        queue.async { unownedJob.runSynchronously(on: self.asUnownedSerialExecutor()) }
    }
}

actor LegacySubsystem {
    private let executor = LegacyQueueExecutor()
    nonisolated var unownedExecutor: UnownedSerialExecutor { executor.asUnownedSerialExecutor() }
}
```

Reach for custom executors only when bridging with an existing serial queue that can't be replaced outright — for new code, plain actors are simpler and sufficient.

## Avoiding thread explosion

Thread explosion happens when many blocking calls pile up and the (older) GCD runtime spins up threads to compensate, exhausting system resources. Swift Concurrency's cooperative pool structurally prevents this **as long as you don't block inside it** — the pool has a fixed thread count and won't grow to compensate for blocked threads. This means blocking inside an async function doesn't just slow one task down, it can deadlock the whole pool if enough tasks block simultaneously (e.g., a pool of 4 threads with 4 tasks all doing `DispatchSemaphore.wait()` waiting on a fifth task that never gets a thread to run on).

## GCD/Dispatch interop

Bridge in both directions deliberately:

```swift
// GCD -> async: wrap once.
func legacyNotify() async {
    await withCheckedContinuation { continuation in
        NotificationCenter.default.addObserver(forName: .dataDidLoad, object: nil, queue: nil) { _ in
            continuation.resume()
        }
    }
}

// async -> GCD: hop out explicitly if you must call from sync, non-async code.
func kickOffFromSyncContext() {
    Task {
        await performAsyncWork()
    }
}
```

Don't mix `DispatchQueue.sync` with awaited actor calls — synchronously blocking while waiting for an actor method to complete can deadlock if the actor's executor happens to be busy with the very thread you're blocking.

## Common pitfalls

- **Holding a lock across an `await`.** The task can suspend mid-lock, and another task may then try to acquire the same lock inside a different suspended context, leading to a pool-wide stall. Never `await` while holding an `NSLock`/`os_unfair_lock`.
- **Assuming `@MainActor` and "main thread" are the same as `DispatchQueue.main`.** They target the same thread but aren't directly interchangeable in scheduling semantics — don't mix `DispatchQueue.main.async` and `@MainActor` isolation for the same state; pick one.
- **Spinning up `Task.detached` in a loop for CPU-bound work** — this doesn't parallelize better than a bounded `TaskGroup` and can oversubscribe the pool; use a bounded group (see `tasks.md`).
