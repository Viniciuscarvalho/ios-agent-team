# Traits and tags

Traits are values passed as extra arguments to `@Test`/`@Suite` that customize behavior: when a test runs, how long it may run, what metadata it carries, and what setup/teardown wraps it.

## Tags

Tags are cross-cutting labels — unlike suites, a test can carry many tags, and tags aren't tied to source location. Use them for things like `.smoke`, `.flaky`, `.requiresNetwork`, `.legallyRequired`.

Declare tags as static members of `Tag`, using the `@Tag` macro, inside an `extension Tag`:

```swift
extension Tag {
    @Tag static var smoke: Self
    @Tag static var requiresNetwork: Self
}
```

For tags meant to be unique across packages (e.g. in a shared test-utilities module), nest them under a reverse-DNS-named type:

```swift
extension Tag.com_example_myapp {
    @Tag static var legallyRequired: Tag
}
```

Apply tags with the `.tags()` trait:

```swift
@Test("License validation", .tags(.smoke, .legallyRequired))
func test_licenseCheck_expiredLicense_returnsInvalid() {
    #expect(License(expiresAt: .distantPast).isValid == false)
}
```

Tag a whole suite to tag every test inside it:

```swift
@Suite(.tags(.requiresNetwork))
struct APIClientTests {
    @Test func test_fetch_validEndpoint_returns200() async throws { /* ... */ }
}
```

Tags are declared once and reused across the codebase — never inline string tags. Use them to drive CI filtering (see `xcode-workflows.md`) instead of splitting suites by naming convention (`SmokeTests`, `FlakyTests`).

## Conditional execution: `.enabled` / `.disabled`

```swift
@Test(.enabled(if: FeatureFlags.newCheckoutEnabled))
func test_newCheckout_completesOrder() async throws { /* ... */ }

@Test(.disabled("Backend endpoint not deployed yet — see JIRA-1234"))
func test_recommendationEngine_returnsPersonalizedResults() async throws { /* ... */ }

@Test(.disabled(if: ProcessInfo.processInfo.environment["CI"] != nil, "Flaky under CI load — JIRA-5678"))
func test_animation_completesWithinFrameBudget() { /* ... */ }
```

- `.disabled(_:)` takes a plain reason string and always skips — treat the reason as mandatory documentation, not optional flavor text. Reference a ticket, per this project's `TODO: [TICKET-123]` convention.
- `.disabled(if:_:)` skips conditionally; the condition is evaluated once, before the test runs.
- `.enabled(if:_:)` is the inverse — the test only runs when the condition is true. Prefer `.enabled(if:)` when the "on" case is the exception (e.g. platform/feature-flag gated tests); prefer `.disabled(if:)` when the "off" case is the exception (temporarily broken test).
- Do not reach for `.disabled` as a substitute for fixing a flaky test — use `withKnownIssue` (see below) to keep the test executing and reporting, just without failing the suite.

## Time limits

```swift
@Test(.timeLimit(.seconds(2)))
func test_imageResize_largeImage_completesQuickly() async throws {
    let resized = try await ImageResizer.resize(largeImage, to: .thumbnail)
    #expect(resized.size == .thumbnail)
}
```

`.timeLimit()` fails the test if it doesn't finish within the given duration — use it for regression protection against accidental `O(n²)` changes or hangs, not as a substitute for a real performance test suite (`XCTMetric` still owns that job).

## Associating bugs

`.bug()` links a test to an issue tracker entry — useful alongside `.disabled` or on a test written specifically to reproduce a regression:

```swift
@Test(.bug("https://github.com/example/repo/issues/1234"))
func test_cache_concurrentWrites_doesNotCorruptState() { /* ... */ }

@Test(.bug(id: "JIRA-5678", "Login crash on cold start"))
func test_login_coldStart_doesNotCrash() { /* ... */ }
```

The URL form must be a parseable RFC 3986 URL; the `id:` form takes a plain identifier (string or integer) for trackers without stable URLs.

## Known issues without disabling

`withKnownIssue` lets a test keep running and reporting instead of being skipped, while not failing the overall run for a known, tracked bug:

```swift
@Test func test_export_largeDataset_producesValidFile() async throws {
    await withKnownIssue("Exporter drops the last row — JIRA-9012") {
        let file = try await Exporter.export(largeDataset)
        #expect(file.rowCount == largeDataset.count)
    }
}
```

If the wrapped code starts passing again, `withKnownIssue` itself fails — a built-in nudge to go delete the workaround and the ticket.

## Custom traits

Implement `TestTrait` (attachable to `@Test`) and/or `SuiteTrait` (attachable to `@Suite`) to package cross-cutting setup/teardown behind a single attribute. Add `TestScoping` to run code before and after the test:

```swift
struct MockAPICredentialsTrait: TestTrait, TestScoping {
    func provideScope(
        for test: Test,
        testCase: Test.Case?,
        performing function: @Sendable () async throws -> Void
    ) async throws {
        let mockCredentials = APICredentials(apiKey: "test-key")
        try await APICredentials.$current.withValue(mockCredentials) {
            try await function()
        }
    }
}

extension Trait where Self == MockAPICredentialsTrait {
    static var mockAPICredentials: Self { Self() }
}
```

Usage reads exactly like a built-in trait:

```swift
@Test(.mockAPICredentials)
func test_apiClient_authenticatedRequest_succeeds() async throws {
    // APICredentials.current is the mock for the duration of this test
}
```

Reach for a custom trait when the same setup/teardown/condition logic would otherwise be copy-pasted across many tests — e.g. binding a mock task-local, requiring a specific OS version plus a feature flag together, or recording custom metadata for a reporting tool. Don't build one for a single test; inline the logic in `init`/the test body instead.

## Trait ordering and inheritance

- Suite-level traits apply to every test in the suite, including nested suites — `.tags()` and `.serialized` are both recursive.
- Traits on a `@Test` combine with traits on its enclosing `@Suite`; conditions (`.enabled`/`.disabled`) combine with AND semantics — if either says "don't run," the test doesn't run.
- Prefer traits over ad hoc `if shouldSkip { return }` inside the test body — traits show up in tooling (Xcode's Test Navigator, `swift test` output) as skipped/disabled, while an early `return` silently reports as a pass.
