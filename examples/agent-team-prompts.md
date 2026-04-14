# Example Agent Team Prompts

These are copy-paste prompts for spawning iOS agent teams for common workflows.

## Build a new feature end-to-end

```
Create an agent team to build the [feature name]:
- swiftui-expert teammate: build the UI views and navigation
- swift-concurrency-expert teammate: implement the async data layer
- swift-testing-expert teammate: write tests as the other two build

Have the testing teammate review and test the code the others produce.
Require plan approval before anyone makes changes.
```

## Migrate to Swift 6

```
Create an agent team to migrate this project to Swift 6:
- One teammate to audit and fix Sendable conformance across models
- One teammate to fix actor isolation issues in view models and services  
- One teammate to update tests for the new concurrency patterns

Start with a planning phase. Each teammate should own non-overlapping modules.
Have them report back before making changes so I can approve the plan.
```

## Comprehensive code review

```
Create an agent team to review the code in this PR:
- One teammate focused on SwiftUI best practices and performance
- One teammate checking concurrency safety and data race potential
- One teammate validating test coverage and test quality

Have them review independently then share and challenge each other's findings.
Synthesize into a single prioritized report.
```

## Modernize a legacy screen

```
Create an agent team to modernize the [ScreenName] module:
- swiftui-expert: refactor the UIKit views to SwiftUI with proper state management
- swift-concurrency-expert: replace completion handlers with async/await
- swift-testing-expert: convert XCTests to Swift Testing and add missing coverage

Each teammate owns their domain. The SwiftUI teammate goes first since others depend on the new API surface.
```

## Debug a flaky test suite

```
Create an agent team to investigate flaky tests:
- One teammate analyzing test isolation and shared state
- One teammate checking for concurrency issues in the tested code
- One teammate reviewing CI logs and test timing patterns

Have them share theories and try to disprove each other's hypotheses.
Update findings in a shared document.
```
