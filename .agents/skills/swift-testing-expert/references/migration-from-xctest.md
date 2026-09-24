# Migration from XCTest

Swift Testing and XCTest can coexist in the same target/scheme — migrate incrementally rather than in one big rewrite. Keep XCTest for what it still uniquely owns: `XCUIApplication` UI automation and `XCTMetric` performance measurement. Everything else is a good migration candidate.

## Symbol mapping table

| XCTest | Swift Testing | Notes |
|---|---|---|
| `import XCTest` | `import Testing` | Only in test targets. |
| `class FooTests: XCTestCase` | `@Suite struct FooTests` (or omit `@Suite` if no traits/display name needed) | Prefer `struct` unless you need `deinit` or reference semantics. |
| `func testFoo()` | `@Test func test_foo_condition_outcome()` | No `test` prefix requirement, but keep it for the naming convention. |
| `override func setUp()` | `init()` | Runs fresh before every test — same as XCTest's per-test `setUp`. |
| `override func setUp() throws` | `init() throws` | |
| `override func setUpWithError() throws` | `init() throws` | |
| `override func tearDown()` | `deinit` (class suites only) or `defer` inside the test | Structs have no `deinit`; prefer scoping cleanup locally or via a custom `TestScoping` trait. |
| `XCTAssertEqual(a, b)` | `#expect(a == b)` | |
| `XCTAssertNotEqual(a, b)` | `#expect(a != b)` | |
| `XCTAssertTrue(x)` | `#expect(x)` | |
| `XCTAssertFalse(x)` | `#expect(!x)` | |
| `XCTAssertNil(x)` | `#expect(x == nil)` | |
| `XCTAssertNotNil(x)` | `#expect(x != nil)` | |
| `XCTUnwrap(x)` | `try #require(x)` | |
| `XCTAssertThrowsError(try f())` | `#expect(throws: (any Error).self) { try f() }` | Use a specific error type instead of `(any Error).self` when known. |
| `XCTAssertNoThrow(try f())` | `#expect(throws: Never.self) { try f() }` | |
| `XCTAssertGreaterThan(a, b)` / similar comparison asserts | `#expect(a > b)` | All comparison asserts collapse to the plain Swift operator inside `#expect`. |
| `XCTFail("message")` | `Issue.record("message")` | |
| `XCTSkip("reason")` (thrown mid-test) | `.disabled("reason")` trait | Prefer the trait — it's visible before the test runs, not discovered mid-execution. |
| `XCTSkipIf(condition)` | `.disabled(if: condition, "reason")` | |
| `XCTSkipUnless(condition)` | `.enabled(if: condition, "reason")` | |
| `func testFoo_withInput1()`, `testFoo_withInput2()`, ... (manually duplicated) | `@Test(arguments: [...]) func test_foo(...)` | See `parameterized-testing.md`. |
| `XCTContext.runActivity(named:)` | Not needed — Swift Testing's structured output (suite/test/case hierarchy) replaces manual activity grouping. | |
| `measure { }` / `XCTMetric` | Keep in XCTest | No Swift Testing equivalent yet. |
| `XCUIApplication`, UI test target | Keep in XCTest | Swift Testing does not replace UI automation. |
| `continueAfterFailure = false` | Not applicable | `#require` already gives you stop-on-failure per assertion; there's no suite-wide toggle because the two macros already express the intent explicitly. |
| `self.expectation(description:)` + `wait(for:timeout:)` | `await` the `async` call directly, or `confirmation { }` for callback APIs | See `async-testing-and-waiting.md`. |
| Test class inheritance for shared setup | Composition: inject shared fixtures via `init`, or a custom trait | Swift Testing suites don't inherit from each other; prefer a shared helper type or trait over a base-class hierarchy. |

## Incremental migration order

1. **Assertions first, inside existing `XCTestCase` classes is not possible** — Swift Testing macros only work in `@Test` functions, so migration happens file-by-file, not assertion-by-assertion within a file. Pick one test file at a time.
2. **Convert leaf test files with no shared base class** first — lowest risk, fastest signal.
3. **Convert `setUp`/`tearDown` to `init`/`deinit`** as part of the same pass — don't leave a file half-XCTest, half-Swift-Testing.
4. **Introduce parameterization** (`@Test(arguments:)`) only after the direct 1:1 port is green — collapsing near-duplicate tests is a separate, reviewable step from the mechanical port.
5. **Add tags/traits** last, once the team has agreed on a tag vocabulary (see `traits-and-tags.md`) — retrofitting tags onto every suite in the same PR as the mechanical migration makes the diff unreviewable.
6. **Leave UI tests and performance tests on XCTest** — don't force a port where the framework doesn't fit.

## Things that don't map 1:1

- **Test order guarantees.** XCTest ran tests in a defined (often alphabetical or declaration) order by default within a class; Swift Testing runs in parallel by default (see `parallelization-and-isolation.md`). If a migrated suite relies on order, that's a latent bug the migration will surface — fix the shared state, don't reach for `.serialized` as a permanent fix.
- **`continueAfterFailure`.** There's no global switch; each assertion already chooses its own behavior via `#expect` vs `#require`.
- **Custom `XCTestCase` base classes for shared assertions.** Convert shared assertion helpers into free functions or extensions that take the value under test as a parameter — Swift Testing suites favor composition over the inheritance hierarchies XCTest classes often grew.

## Verifying a migrated file

After converting a file, run just that file's tests (see `xcode-workflows.md` for filtering) and confirm:

- Test count matches (no accidentally-merged or dropped cases).
- Assertions that previously used `XCTAssertEqual` messages still surface useful failure info (Swift Testing's automatic expression capture usually makes custom messages unnecessary — trim them where they're now redundant).
- No `XCTest` import remains in the file once fully converted.
