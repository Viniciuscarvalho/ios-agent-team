# Swift Testing reference index

This directory is the deep-dive companion to `SKILL.md`. Read `SKILL.md` for the quick mental model; come here for specifics.

## Map of files

- **`fundamentals.md`** — `@Test` functions, `@Suite` types, instance lifecycle (`init`/`deinit`), nesting suites, display names, AAA structure in Swift Testing syntax. Start here if you have never written a Swift Testing test.
- **`expectations.md`** — `#expect` vs `#require`, expression capture, custom failure messages, comparing optionals/collections/floating point, `#expect(throws:)`, multiple expectations per test.
- **`traits-and-tags.md`** — Built-in traits (`.tags()`, `.enabled(if:)`, `.disabled()`, `.timeLimit()`, `.bug()`), defining custom `Tag`s, conditional execution, writing custom `TestTrait`/`SuiteTrait`/`TestScoping` types.
- **`parameterized-testing.md`** — `@Test(arguments:)` with one or more collections, Cartesian product behavior, `zip()` to pair collections, dictionary/enum arguments, readability tips for large parameter sets.
- **`parallelization-and-isolation.md`** — Why tests run in parallel by default, how that interacts with `@MainActor` and actors, `@Suite(.serialized)`, diagnosing and fixing shared-mutable-state flakiness, `--no-parallel`.
- **`performance-and-best-practices.md`** — One logical concept per test, keeping control flow out of tests, naming conventions (`test_method_condition_expectedOutcome`), suite organization, avoiding over-abstracted test helpers.
- **`async-testing-and-waiting.md`** — Testing `async` APIs directly with `await`, testing `AsyncSequence`/streams, confirmation-based testing of callbacks/delegates, why sleeps and polling loops are a smell.
- **`migration-from-xctest.md`** — Symbol-for-symbol mapping table (`XCTAssertEqual` → `#expect`, `setUp`/`tearDown` → `init`/`deinit`, `XCTestCase` → `@Suite` struct, `XCTSkip` → `.disabled()`), and an incremental migration order.
- **`xcode-workflows.md`** — Running tests via Xcode's Test Navigator, `swift test`, `xcodebuild test`; test plans; filtering by name/tag from the command line; CI integration notes.

## Pick a file by symptom

| Symptom / question | Go to |
|---|---|
| "How do I even write a test?" | `fundamentals.md` |
| "Should I use `#expect` or `#require` here?" | `expectations.md` |
| "This test should only run on iOS 18+" / "skip in CI" | `traits-and-tags.md` |
| "I have 12 nearly-identical tests" | `parameterized-testing.md` |
| "Tests pass alone but fail together" | `parallelization-and-isolation.md` |
| "Is this test well-structured?" | `performance-and-best-practices.md` |
| "How do I test this async function / stream?" | `async-testing-and-waiting.md` |
| "We're migrating off XCTest" | `migration-from-xctest.md` |
| "How do I run just the `@Tag(.smoke)` tests in CI?" | `xcode-workflows.md` |
