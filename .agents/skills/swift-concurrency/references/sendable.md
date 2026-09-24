# Sendable, `sending`, and Region-Based Isolation

## What `Sendable` means

`Sendable` is a marker protocol: a type conforming to it asserts that its values can be safely shared across isolation domains (actors, tasks, threads) without introducing a data race. The compiler enforces this for structs/enums; for classes, you must prove it yourself.

```swift
struct UserPreferences: Sendable {
    var theme: Theme
    var notificationsEnabled: Bool
}
```

A struct/enum is implicitly `Sendable` if every stored property/associated value is `Sendable` — you often don't need to write the conformance explicitly for simple value types, but writing it explicitly documents intent and catches regressions if a non-Sendable property is added later.

## Classes and `Sendable`

Reference types need one of these to be `Sendable`:

1. **Immutable state only** (`let` properties, all `Sendable` types) — safe to share because there's nothing to race on.

```swift
final class ImmutableConfig: Sendable {
    let apiBaseURL: URL
    let timeout: TimeInterval
}
```

2. **All mutable state behind a lock or actor**, with `@unchecked Sendable` and a documented invariant:

```swift
final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var _value = 0

    var value: Int {
        lock.withLock { _value }
    }

    func increment() {
        lock.withLock { _value += 1 }
    }
}
```

`@unchecked Sendable` disables compiler verification — use it only when you've manually confirmed every mutable access is synchronized, and leave a comment explaining how. It is not a way to silence a warning you don't understand; treat every use as a claim you can defend in review.

3. **Just make it an `actor`** instead of a locked class — usually simpler and gets Sendable-ness for free, since actors are `Sendable` by default (their public API is already safe to call from any isolation domain).

## `@Sendable` closures

A closure that will run on a different isolation domain than where it's created must be `@Sendable` — it can only capture `Sendable` values.

```swift
func onBackground(_ work: @Sendable @escaping () -> Void) {
    Task.detached { work() }
}

let count = 0   // fine to capture, it's Sendable (Int)
onBackground { print(count) }
```

Non-`Sendable` captures are a compile error under strict concurrency:

```swift
final class MutableBox { var value = 0 }
let box = MutableBox()

onBackground { box.value += 1 }   // error: capture of 'box' with non-sendable type 'MutableBox' in a `@Sendable` closure
```

## `sending` parameters and results (SE-0430)

`sending` lets a *non-Sendable* value cross an isolation boundary safely, as long as the compiler can prove the caller gives up all other uses of it — i.e., ownership is fully transferred, not shared. This is more permissive than requiring full `Sendable` conformance, because it doesn't require the *type* to be safe to share in general, only that *this particular value* isn't shared after the call.

```swift
final class ImageBuffer {   // not Sendable — mutable, no locking
    var pixels: [UInt8]
    init(pixels: [UInt8]) { self.pixels = pixels }
}

func process(_ buffer: sending ImageBuffer) async -> ProcessedImage {
    // buffer is guaranteed not referenced anywhere else once passed in
    ...
}

let buffer = ImageBuffer(pixels: rawBytes)
let result = await process(buffer)   // ownership of `buffer` transferred; using `buffer` again after this is an error
```

If you try to use `buffer` again after the `sending` call, the compiler flags it — that's the whole mechanism: it's not a runtime check, it's a static proof that no other reference to the value exists at the point it crosses the boundary.

`sending` on a return value promises the opposite direction: the returned value is disconnected from anything else the callee holds, so the caller can treat it as safe to send onward even if the type itself isn't `Sendable`.

```swift
func loadImage() async -> sending ImageBuffer {
    let buffer = ImageBuffer(pixels: decodedBytes())
    return buffer   // fine: no other reference to buffer escapes this function
}
```

## Region-based isolation (SE-0414)

Region-based isolation is the analysis underpinning `sending`: the compiler partitions values into "regions" based on how they're connected (shared references, captures, etc.). A value in a region that has no other live references is "disconnected" and can be sent across an isolation boundary even if its type isn't `Sendable`, because sending it doesn't create a shared mutable reference on both sides.

This is why you can do things like construct a non-Sendable object and immediately pass it into a `Task` without a Sendable conformance, as long as you don't keep a usable reference around afterward:

```swift
func kickOff() {
    let box = MutableBox()   // not Sendable
    Task {
        box.value += 1   // OK: `box` is a disconnected region with no other references
    }
    // using `box` here again would be an error — its region was sent into the Task
}
```

Region-based isolation is what makes `sending` practical in everyday code — without it, every non-Sendable value passed anywhere would need a full `Sendable` conformance, which would make gradual adoption much harder.

## Sendable-checking a generic function

```swift
func run<T: Sendable>(_ work: @Sendable () -> T) async -> T {
    await Task { work() }.value
}
```

Generic code that crosses isolation boundaries needs `Sendable` constraints on the type parameters that actually cross, propagated the same way you'd propagate any other protocol requirement.

## `@preconcurrency` for un-migrated dependencies

When a dependency hasn't adopted `Sendable` annotations yet, `@preconcurrency import` downgrades that module's concurrency-safety violations from errors to warnings, unblocking your own module's Swift 6 adoption without waiting on the dependency.

```swift
@preconcurrency import SomeLegacySDK
```

Remove it once the dependency ships proper annotations — it's a temporary bridge, not a permanent suppression.

## Decision guide

| Situation | Approach |
|---|---|
| Plain data, all `Sendable` members | Implicit or explicit `Sendable` conformance, no extra work |
| Reference type, all `let` | `Sendable` conformance (compiler-checked automatically since it's provably safe) |
| Reference type, mutable state, already synchronized | `@unchecked Sendable` + documented invariant, or better: refactor to an `actor` |
| Passing a non-Sendable value once, giving up the caller's reference | `sending` parameter |
| Returning a freshly-created non-Sendable value | `sending` return type |
| Dependency hasn't adopted concurrency annotations | `@preconcurrency import`, temporarily |
