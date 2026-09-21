# async/await Basics

## Declaring async functions

`async` marks a function as potentially suspending — it may pause execution to wait on other work without blocking the underlying thread.

```swift
func fetchUser(id: String) async throws -> User {
    let (data, response) = try await URLSession.shared.data(from: userURL(id))
    guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
        throw NetworkError.badResponse
    }
    return try JSONDecoder().decode(User.self, from: data)
}
```

Calling an async function requires `await` at every suspension point. `await` does not mean "wait synchronously" — it marks a point where the current task may yield the thread back to the cooperative pool so other work can run.

## Throwing async functions

`async throws` composes the two effects independently. Order matters in the declaration (`async throws`, never `throws async`), but at the call site you write `try await`, and either order of `try`/`await` at the call site is accepted — convention is `try await`.

```swift
func loadProfile() async throws -> Profile {
    async let user = fetchUser(id: currentUserID)
    async let settings = fetchSettings(id: currentUserID)
    return try await Profile(user: user, settings: settings)
}
```

Typed throws (Swift 6) lets you narrow the error type:

```swift
enum ProfileError: Error { case notFound, decodingFailed }

func loadProfile() async throws(ProfileError) -> Profile {
    // every throw site must produce a ProfileError
}
```

Typed throws is most valuable on protocol requirements (e.g., custom `AsyncSequence.Failure`, see `async-sequences.md`) and library boundaries where callers benefit from exhaustive `catch`. Don't retrofit it onto every internal function — `any Error` is fine for app-level code that doesn't need exhaustive error handling.

## async properties and subscripts

Computed properties and subscripts can be `async` (and `async throws`), but stored properties cannot.

```swift
extension RemoteConfig {
    var featureFlags: [String: Bool] {
        get async throws {
            try await fetchLatestFlags()
        }
    }
}
```

## `async let` — concurrent child tasks, structured

`async let` starts a child task immediately; the value is awaited (and the task's result retrieved) wherever you use it. All `async let` bindings in a scope run concurrently.

```swift
func makeDashboard() async throws -> Dashboard {
    async let feed = fetchFeed()
    async let notifications = fetchNotifications()
    async let profile = fetchProfile()
    return try await Dashboard(feed: feed, notifications: notifications, profile: profile)
}
```

If you never `await` an `async let` binding, it is implicitly cancelled and awaited when it goes out of scope. If one throws and you don't await the others, they are cancelled automatically — this is structured concurrency's cleanup guarantee. For a dynamic number of children (not known at compile time), use `TaskGroup` instead — see `tasks.md`.

## Bridging callback-based APIs

Wrap delegate/completion-handler APIs exactly once, at the seam, using a continuation. Never call the continuation more than once — that's a runtime crash in debug builds and undefined behavior in release.

```swift
func requestLocation() async throws -> CLLocation {
    try await withCheckedThrowingContinuation { continuation in
        locationManager.requestLocation { result in
            switch result {
            case .success(let location):
                continuation.resume(returning: location)
            case .failure(let error):
                continuation.resume(throwing: error)
            }
        }
    }
}
```

Use `withCheckedContinuation`/`withCheckedThrowingContinuation` during development — they trap on double-resume and warn if you never resume. Only drop to the unchecked variants (`withUnsafeContinuation`) once profiling shows the checked variant's bookkeeping matters, which is rare.

For delegate callbacks that fire multiple times (progress, streaming), don't force them into a single continuation — model them as an `AsyncStream` instead (see `async-sequences.md`).

## Avoid over-wrapping synchronous code

Don't mark a function `async` just because it's called from async context. If a function has no suspension points, keep it synchronous — it composes better and avoids implying cooperative-pool costs it doesn't have.

```swift
// Unnecessary — no suspension point inside.
func formatted(_ value: Double) async -> String { String(format: "%.2f", value) }

// Correct — plain synchronous function, callable from anywhere.
func formatted(_ value: Double) -> String { String(format: "%.2f", value) }
```

## Common pitfalls

- **Forgetting `await` doesn't compile** — the compiler forces you to mark every suspension point, so this class of bug is caught at compile time, not runtime.
- **Sequential `await` where concurrency was intended.** `let a = try await f(); let b = try await g()` runs sequentially. Use `async let` or `TaskGroup` if `f` and `g` are independent.
- **`await`-ing inside a tight loop when the work could be batched.** Each `await` is a potential suspension/resumption; for many independent items prefer `TaskGroup` (bounded concurrency) over sequential awaits in a `for` loop.
- **Continuations that can resume twice** (e.g., both a success and a timeout callback firing) — guard with a boolean or actor-protected flag if the underlying API doesn't guarantee single-invocation semantics.
