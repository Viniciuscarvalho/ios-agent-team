# Xcode and CLI workflows

## Running in Xcode

- The Test Navigator (⌘6) lists every `@Suite`/`@Test`, mirroring their display names (or Swift function names when no display string is given). Diamond icons run individual tests or whole suites.
- ⌘U runs the active scheme's full test plan. ⌃⌥⌘U runs just the tests in the current file/cursor position.
- Failed `#expect`/`#require` calls report inline at the call site, with the captured expression values (e.g. `user.age → 17`) shown directly in the gutter — no need to add a custom message for basic equality/comparison failures.
- Parameterized test cases appear as expandable children under the parameterized test in the navigator, each individually re-runnable.

## `swift test` (Swift Package Manager)

```bash
swift test
```

Common flags:

```bash
swift test --filter UserSessionTests                       # by suite/type name (regex-capable)
swift test --filter "test_login_.*"                        # by test name pattern
swift test --parallel                                       # explicit opt-in on toolchains where it isn't already default
swift test --no-parallel                                    # force fully serial run — useful for isolating a suspected isolation bug
swift test --list-tests                                     # print discovered tests without running them
```

`--filter` matches against the fully-qualified test identifier (module.suite/test), so a partial regex against the suite or function name works without needing the display string.

## `xcodebuild test`

```bash
xcodebuild test \
  -scheme MyApp \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing:MyAppTests/UserSessionTests
```

- `-only-testing:<Target>/<Suite>/<test>` scopes to a target, suite, or individual test — the same identifier format as Xcode's navigator, dot- and slash-separated.
- `-skip-testing:<Target>/<Suite>` excludes a suite while running everything else.
- Combine with `-resultBundlePath` to produce a `.xcresult` for CI artifact upload; `xcrun xcresulttool get --path result.xcresult --format json` extracts pass/fail counts and failure messages for custom CI reporting.

## Filtering by tag from the command line

Tags (see `traits-and-tags.md`) aren't yet a first-class `-only-testing` filter in `xcodebuild`; the reliable cross-tool way to filter by tag is a **test plan**.

## Test plans

A `.xctestplan` file lets you define named configurations (e.g. "Smoke", "Full Regression") that include/exclude by target, and — for Swift Testing tags specifically — by tag, without touching source:

1. In Xcode: **Product → Scheme → Edit Scheme → Test → Info**, then create/select a test plan.
2. In the test plan editor, under a target's **Tags** filter, list tags to include or exclude (matches `.tags(.smoke)` etc. from your traits).
3. Reference the plan explicitly from the CLI:

```bash
xcodebuild test \
  -scheme MyApp \
  -testPlan Smoke \
  -destination 'platform=iOS Simulator,name=iPhone 16'
```

Keep test plans in source control alongside the scheme — they're plain JSON (`.xctestplan`) and diff/review like any other config file.

## Suggested CI split

- **Fast/smoke tier**: `-testPlan Smoke` (or `swift test --filter` against a smoke-tagged suite naming convention if not using Xcode test plans) on every PR — should complete in well under a minute.
- **Full tier**: unrestricted `swift test` / `xcodebuild test` on merge to main or on a schedule — includes everything, including `.serialized` suites and longer `.timeLimit()` tests.
- Keep `.disabled` tests out of both tiers by construction (they're skipped automatically) but track their tracked-bug references so they don't rot silently — periodically grep for `.disabled(` and confirm each still has a live ticket.

## Reading failures fast

- A `#expect` failure in Xcode's Report Navigator shows the source expression plus captured runtime values without you writing a message — read that before reaching for `po` in the debugger.
- For a parameterized test, the specific failing case's arguments are printed alongside the failure — you don't need to bisect the argument list manually.
- `swift test` and `xcodebuild test` both print a per-test pass/fail summary at the end; grep that summary for `failed` in CI logs before diving into the full output.
