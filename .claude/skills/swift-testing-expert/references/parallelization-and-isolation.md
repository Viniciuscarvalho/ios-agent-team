# Parallelization and isolation

## Parallel by default

Swift Testing runs tests **in parallel with respect to each other by default**, using structured concurrency (task groups) rather than dedicated threads or processes — tests generally run in the same process, and the Swift runtime manages how many run concurrently based on available cores. This applies to:

- Different `@Test` functions, whether free functions or suite members.
- Different suites.
- Individual cases of a parameterized test — each element passed via `arguments:` can run concurrently with the others.

This is why the per-test-instance model matters (see `fundamentals.md`): a fresh `struct`/`class` instance per test means there is no shared mutable state to race on, as long as you don't reach outside that instance.

## Opting out with `.serialized`

```swift
@Suite(.serialized)
struct LegacyDatabaseTests {
    @Test func test_insert_record_persists() { /* ... */ }
    @Test func test_delete_record_removesIt() { /* ... */ }
}
```

`.serialized` forces every test and sub-suite inside the annotated suite to run one at a time, in declaration order. It is **recursive** — apply it to a suite and every nested suite and parameterized test inside inherits it. You can also apply it to a single parameterized test to force its cases to run one at a time instead of the whole suite:

```swift
@Test(.serialized, arguments: sharedFixtureIDs)
func test_processSharedFixture_sequentialAccess_doesNotCorruptFile(_ id: Int) { /* ... */ }
```

`.serialized` only affects ordering *within* the trait's scope — it does not serialize that suite relative to unrelated suites, and it has no effect at all if parallelization is globally disabled (`swift test --no-parallel` or the equivalent Xcode scheme setting).

Treat `.serialized` as a documented, temporary fix, not a design choice: it's a signal that something in the suite has shared state that hasn't been isolated yet. Leave a comment linking the reason:

```swift
@Suite(.serialized) // Shared SQLite file on disk — TODO: [TICKET-456] move to isolated in-memory DB per test
struct ReportGeneratorTests { /* ... */ }
```

## Actor isolation in tests

If a test needs to run on the main actor (because it touches `@MainActor`-isolated UI code), isolate the test function itself rather than the whole suite:

```swift
@Suite
struct ViewModelTests {
    @Test @MainActor
    func test_viewModel_onAppear_loadsInitialState() async {
        let viewModel = FeedViewModel()
        await viewModel.onAppear()
        #expect(viewModel.items.isEmpty == false)
    }

    @Test
    func test_feedItem_decoding_parsesTimestamp() throws {
        // Not main-actor isolated — runs freely in parallel with the test above
    }
}
```

`@MainActor`-isolated tests still run concurrently with each other and with non-isolated tests in the surrounding task-group model, but their bodies serialize relative to other main-actor work because the main actor itself only runs one task at a time — that's actor semantics, not a testing-library special case. Don't mark an entire suite `@MainActor` just to silence isolation errors on one test; it forces every test in the suite onto the main actor and defeats parallelism for no reason.

An `actor`-typed suite gives every test isolation to that actor:

```swift
@Suite
actor CacheTests {
    let cache = Cache()

    @Test func test_store_value_isRetrievable() async {
        await cache.store(1, forKey: "a")
        #expect(await cache.value(forKey: "a") == 1)
    }
}
```

Each test still gets its own actor instance (per the per-test-instance rule), so this isolates the *test body's* access to `self`, not shared state across tests.

## Shared mutable state pitfalls

The most common flaky-test root causes under parallel execution:

- **Singletons and global state.** A test that reads/writes `UserDefaults.standard`, a shared `URLCache`, or an app-wide singleton will race with any other parallel test touching the same singleton. Inject a fresh instance per test instead:

```swift
@Suite
struct SettingsTests {
    let defaults: UserDefaults

    init() {
        defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)")!
    }

    @Test func test_setFlag_thenRead_returnsSetValue() {
        defaults.set(true, forKey: "flag")
        #expect(defaults.bool(forKey: "flag"))
    }
}
```

- **Shared files/database paths.** Give each test its own temp directory (as in `fundamentals.md`'s `TempFileTests`) rather than a suite-wide fixed path.
- **Static/class-level mutable properties** in the type under test, not the test suite — these race regardless of how the test suite is isolated. This is a production code smell (mutable global state), and fixing it there is the correct fix, not `.serialized`.
- **Order-dependent tests.** If test B only passes because test A happened to run first and left state behind, that's the same underlying bug as parallel-unsafe state — fix the shared state, don't force serial order.

## Diagnosing a "passes alone, fails together" test

1. Run the single suspect test in isolation (`swift test --filter ...`, see `xcode-workflows.md`) — if it passes alone every time, it's an isolation problem, not a logic bug.
2. Grep the test and the code under test for `static var`, singletons (`.shared`), `UserDefaults.standard`, fixed file paths, or `NSCache`/`URLCache.shared`.
3. As a diagnostic-only step, add `.serialized` to confirm the hypothesis — if serializing makes it pass reliably, you've confirmed shared state, not fixed it.
4. Isolate the shared dependency (fresh instance, injected fake, temp path) and remove `.serialized`.
