---
name: "swift-testing-expert"
description: "Expert guidance for Swift Testing \u2014 test structure, #expect/#require macros, traits and tags, parameterized tests, test plans, parallel execution, async waiting patterns, and XCTest migration."
---

# Swift Testing Expert

Swift Testing is Apple's modern, macro-based testing framework (`import Testing`), replacing XCTest for unit and integration tests on Apple platforms and Swift server projects. It runs on Swift 6+ toolchains and ships with Xcode 16+ and the Swift Package Manager.

Use this skill when writing new tests, migrating an XCTest suite, debugging flaky or racy tests, organizing tests with tags/traits, or wiring test filtering into CI.

## Core mental model

- A **test** is any free function or method annotated `@Test`. No inheritance from a base class is required.
- A **suite** is a type (`struct`, `class`, or `actor`) annotated `@Suite` that groups related tests. Suites can nest.
- Each `@Test` function on a reference type gets a **fresh instance** — `init`/`deinit` replace `setUp`/`tearDown`.
- Assertions are macros, not method calls: `#expect(...)` records a failure and continues; `#require(...)` throws and stops the test immediately.
- **Tests run in parallel by default**, across suites and within parameterized cases, using structured concurrency (task groups) — not by spawning your own threads.
- Traits (`.tags(...)`, `.disabled(...)`, `.timeLimit(...)`, `.serialized`, `.bug(...)`, custom types) attach metadata and behavior to tests/suites via attribute arguments.

## Quick reference

```swift
import Testing

@Suite("User session")
struct UserSessionTests {
    let sessionStore = InMemorySessionStore()

    @Test("Login succeeds with valid credentials")
    func test_login_validCredentials_returnsActiveSession() async throws {
        // Arrange
        let credentials = Credentials(username: "ada", password: "correct-password")

        // Act
        let session = try await sessionStore.login(with: credentials)

        // Assert
        #expect(session.isActive)
    }

    @Test("Login fails for each known-bad credential", arguments: [
        Credentials(username: "", password: "x"),
        Credentials(username: "ada", password: ""),
    ])
    func test_login_invalidCredentials_throwsInvalidCredentialsError(_ credentials: Credentials) async {
        await #expect(throws: SessionError.invalidCredentials) {
            try await sessionStore.login(with: credentials)
        }
    }
}
```

## Where to go deeper

Read `references/_index.md` first — it maps every topic to the right file. In short:

| Need | File |
|---|---|
| Basic `@Test`/`@Suite` structure, AAA layout | `fundamentals.md` |
| `#expect` vs `#require`, custom messages, collections/optionals | `expectations.md` |
| Tags, `.disabled()`, `.timeLimit()`, custom traits, conditional runs | `traits-and-tags.md` |
| Data-driven tests, `arguments:`, zipped/multi-collection parameterization | `parameterized-testing.md` |
| Parallel-by-default execution, `.serialized`, actor isolation, shared state | `parallelization-and-isolation.md` |
| Test naming, one-concept-per-test, avoiding logic in tests | `performance-and-best-practices.md` |
| `await`, Task-based tests, avoiding sleeps/polling | `async-testing-and-waiting.md` |
| XCTest → Swift Testing mapping table | `migration-from-xctest.md` |
| Running in Xcode / `swift test` / `xcodebuild test`, test plans, tag filters | `xcode-workflows.md` |

## Non-negotiables

- Only import `Testing` in test targets — never in app or library code.
- Prefer `#expect` for assertions that should not abort the test; reach for `#require` exactly when a later line depends on the value being present/true (unwrapping, preconditions).
- Default to parallel-safe tests. Reach for `@Suite(.serialized)` only as a documented, temporary fix for shared state — then go fix the shared state.
- Name tests `test_method_condition_expectedOutcome()` even though Swift Testing also supports free-form display strings (`@Test("...")`) — the method name still carries the AAA contract for anyone reading source instead of the test report.
- Keep XCTest around only for `XCUIApplication` UI automation and `XCTMetric` performance tests — Swift Testing does not replace either.
