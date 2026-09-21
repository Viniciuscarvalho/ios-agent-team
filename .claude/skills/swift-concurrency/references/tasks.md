# Tasks, Task Groups, and Structured Concurrency

## Structured vs. unstructured concurrency

Swift Concurrency has three ways to create tasks, with decreasing structure:

1. **`async let`** — fully structured, scoped to the enclosing function.
2. **`TaskGroup`** — structured, scoped to a `withTaskGroup` block, supports a dynamic number of children.
3. **`Task { }`** — unstructured but inherits the creating context's actor isolation, priority, and (partially) cancellation; not tied to a lexical scope, so it can outlive the function that created it.
4. **`Task.detached { }`** — fully unstructured: no inherited actor isolation, no inherited priority, no inherited task-local values, no automatic cancellation propagation from a parent. Rarely the right choice.

Prefer the most structured tool that fits. Reach for `Task.detached` only when you specifically need to escape the creating context (e.g., fire-and-forget analytics that must outlive a cancelled parent).

## `Task { }` — inherits context

```swift
@MainActor
final class SearchViewModel {
    private var searchTask: Task<Void, Never>?

    func searchTextChanged(_ query: String) {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await performSearch(query)
        }
    }
}
```

This is the standard debounce pattern: cancel the previous task before starting a new one, and check cancellation after the delay before doing the expensive work.

## `TaskGroup` — dynamic structured concurrency

Use `withThrowingTaskGroup`/`withTaskGroup` when the number of child tasks isn't known at compile time.

```swift
func fetchThumbnails(for ids: [ImageID]) async throws -> [ImageID: UIImage] {
    try await withThrowingTaskGroup(of: (ImageID, UIImage).self) { group in
        for id in ids {
            group.addTask {
                (id, try await downloadThumbnail(id))
            }
        }
        var result: [ImageID: UIImage] = [:]
        for try await (id, image) in group {
            result[id] = image
        }
        return result
    }
}
```

If one child task throws, the group cancels all remaining children automatically once you propagate the error out of the `for try await` loop (or as soon as the group scope exits due to the throw). Children you never consume are cancelled and awaited when the group scope ends — same cleanup guarantee as `async let`.

### Bounding concurrency

Unbounded `addTask` for thousands of items can overwhelm the cooperative pool or a downstream service. Cap concurrency explicitly:

```swift
func downloadAll(_ urls: [URL], maxConcurrent: Int = 4) async throws -> [Data] {
    try await withThrowingTaskGroup(of: (Int, Data).self) { group in
        var results = [Data?](repeating: nil, count: urls.count)
        var nextIndex = 0

        func addNextTask() {
            guard nextIndex < urls.count else { return }
            let index = nextIndex
            nextIndex += 1
            group.addTask {
                (index, try await URLSession.shared.data(from: urls[index]).0)
            }
        }

        for _ in 0..<min(maxConcurrent, urls.count) { addNextTask() }
        while let (index, data) = try await group.next() {
            results[index] = data
            addNextTask()
        }
        return results.compactMap { $0 }
    }
}
```

### Discarding result groups

If you don't need child results, `withDiscardingTaskGroup`/`withThrowingDiscardingTaskGroup` avoid the memory overhead of buffering results you'll never read.

```swift
await withDiscardingTaskGroup { group in
    for job in backgroundJobs {
        group.addTask { await job.run() }
    }
}
```

## Cancellation is cooperative

Cancelling a task sets a flag; it does not stop execution at an arbitrary point. Code must check for cancellation to react to it.

```swift
func processLargeFile(at url: URL) async throws {
    for try await line in url.lines {
        try Task.checkCancellation()   // throws CancellationError if cancelled
        try processLine(line)
    }
}
```

- `Task.isCancelled` — non-throwing check, use when you want to clean up rather than throw.
- `Task.checkCancellation()` — throws `CancellationError` if cancelled; use in throwing functions to bail out idiomatically.
- Many standard APIs already check for you: `Task.sleep(for:)` throws `CancellationError` when cancelled; `URLSession`'s async APIs cancel the underlying request.

### Reacting to cancellation with cleanup

```swift
func withTemporaryFile() async throws {
    let handle = try makeTemporaryFile()
    try await withTaskCancellationHandler {
        try await doWork(with: handle)
    } onCancel: {
        handle.cleanUp()
    }
}
```

`onCancel` can run concurrently with the operation closure on a different thread — don't assume ordering; guard shared cleanup state with an actor or lock if both sides touch it.

## Task priority

```swift
Task(priority: .userInitiated) {
    await refreshVisibleContent()
}

Task(priority: .background) {
    await pruneOldCache()
}
```

Priority is a hint to the scheduler, not a hard guarantee. Priority escalation happens automatically: if a low-priority task is awaited by a higher-priority one, the runtime bumps the low-priority task up to avoid priority inversion.

## Task-local values

`@TaskLocal` propagates context down the structured-task tree without threading a parameter through every call.

```swift
enum RequestContext {
    @TaskLocal static var traceID: String?
}

func handleRequest() async {
    await RequestContext.$traceID.withValue(UUID().uuidString) {
        await fetchData()   // sees the same traceID
    }
}
```

Task-local values do **not** propagate into `Task.detached` — only through structured children and `Task { }` created from within the `withValue` scope.

## Common pitfalls

- **Storing a `Task` handle only to never cancel it** — if a view model creates a `Task` on every keystroke without cancelling the previous one, you get unbounded concurrent work.
- **Using `Task.detached` to "get out of" actor isolation** — this is almost always a sign the actor boundary is wrong, not that detachment is needed.
- **Ignoring the return value of `TaskGroup.waitForAll()` vs iterating** — iterate with `for try await` if you need results; call `waitForAll()` only when you deliberately don't need them (rare — prefer discarding groups instead).
- **Assuming cancellation stops a task immediately** — a task keeps running until it hits a check; don't assume side effects after `cancel()` are undone.
