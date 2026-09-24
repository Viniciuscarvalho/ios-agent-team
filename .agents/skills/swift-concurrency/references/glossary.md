# Swift Concurrency Glossary

**Actor** — A reference type that guarantees at most one task executes its isolated code at a time, protecting its mutable state from concurrent access without manual locking.

**Actor-isolated** — Describes state or code that can only be accessed synchronously from within its owning actor; access from outside requires `await` and crosses an isolation boundary.

**Async function** — A function marked `async`; it may suspend at `await` points and must be called with `await`.

**AsyncIteratorProtocol** — The protocol backing an `AsyncSequence`'s iteration; its `next()` method is `async` and can throw (optionally with a typed `Failure`).

**AsyncSequence** — A protocol describing a sequence whose elements are produced asynchronously over time, consumed with `for await`.

**AsyncStream / AsyncThrowingStream** — Concrete `AsyncSequence` types that bridge push-based (callback/delegate/notification) producers into `for await`-consumable sequences.

**await** — Marks a point in async code where the current task may suspend, waiting for another piece of async work to produce a value.

**Continuation** — A one-shot bridge (`withCheckedContinuation`/`withCheckedThrowingContinuation`) that suspends the current task until a callback-based API calls `resume`, converting completion-handler code into `async`.

**Cooperative thread pool** — The fixed-size pool of threads (roughly one per CPU core) that Swift Concurrency schedules tasks onto; blocking a pool thread starves other tasks system-wide.

**Data race** — Two or more threads/tasks accessing the same mutable memory concurrently, with at least one write and no synchronization — undefined behavior that Swift 6's compile-time checks aim to eliminate entirely, not just catch at runtime.

**Detached task (`Task.detached`)** — An unstructured task with no inherited actor isolation, priority, or task-local values, and no automatic parent-driven cancellation; escapes structured concurrency entirely.

**Executor** — The runtime component that decides which thread a piece of isolated work runs on next; actors each have a serial executor, `@MainActor` has the main executor, plain async code uses the global cooperative executor.

**Global actor** — An actor-like isolation domain shared by any type/function annotated with it (e.g., `@MainActor`), rather than tied to one specific instance.

**Isolation domain** — A boundary within which a specific set of mutable state can be accessed synchronously; crossing between domains (actor to actor, actor to non-isolated code) requires `await` and Sendable-safety.

**MainActor (`@MainActor`)** — The global actor whose executor always runs on the main thread; used to isolate UI-affecting state and satisfy UIKit/AppKit/SwiftUI's main-thread requirement.

**nonisolated** — Marks a member of an actor (or actor-isolated type) as not requiring actor isolation, typically because it only touches immutable or already-Sendable state; callable synchronously from any isolation domain.

**nonisolated(unsafe)** — An escape hatch on a single stored property that disables isolation checking for it, without affecting the rest of the type; requires the same manual safety proof as `@unchecked Sendable`, scoped to one property.

**Priority inversion** — A scenario where a high-priority task is blocked waiting on a lower-priority one; Swift Concurrency's runtime automatically escalates the lower-priority task's priority to resolve this.

**Reentrancy** — An actor's ability to let another call begin executing while a prior call to the same actor is suspended at an `await`; means actor state can change between two points in the same method that straddle a suspension.

**Region-based isolation (SE-0414)** — The compiler analysis that tracks which values are "connected" (shared/aliased) versus "disconnected" (uniquely referenced), enabling `sending` to move non-Sendable values across isolation boundaries safely when no other reference exists.

**Sendable** — A marker protocol asserting that values of a type can be safely shared across isolation domains without causing a data race; compiler-checked for structs/enums, must be manually justified for mutable reference types.

**sending** — A parameter/return annotation (SE-0430) that permits a non-Sendable value to cross an isolation boundary, as long as region-based isolation can prove the caller relinquishes all other access to it.

**Structured concurrency** — The discipline where async work forms a tree scoped to lexical blocks (`async let`, `TaskGroup`); children are automatically awaited/cancelled when their parent scope ends, and errors/cancellation propagate through the tree.

**Suspension point** — A location (`await`) where a task may pause execution and release its thread back to the cooperative pool, potentially resuming later on a different thread.

**Task** — A unit of asynchronous work; the top-level context in which `async` code runs, carrying its own cancellation state, priority, and (for structured/inherited tasks) actor isolation.

**Task group (`TaskGroup`)** — A structured concurrency construct (`withTaskGroup`/`withThrowingTaskGroup`) for spawning a dynamic number of child tasks and collecting their results, with automatic cleanup on early exit or error.

**Task-local value (`@TaskLocal`)** — A value scoped to a task and its structured children, propagated implicitly through the call tree without an explicit parameter.

**Unstructured task** — A `Task` created outside of `async let`/`TaskGroup`'s lexical scoping; it inherits the creating context's actor isolation and priority (unless `.detached`) but is not tied to any enclosing scope's lifetime.

**@unchecked Sendable** — A conformance that disables the compiler's automatic Sendable verification for a type, used when the author has manually verified (e.g., via locking) that the type is safe to share, and documents that invariant.
