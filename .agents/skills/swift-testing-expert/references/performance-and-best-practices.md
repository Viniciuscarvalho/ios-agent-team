# Performance and best practices

These are quality bars, not framework features — they apply whether you're writing a brand-new test or reviewing one.

## Naming: `test_method_condition_expectedOutcome`

Name the Swift function so it reads as a sentence describing behavior, independent of any `@Test("...")` display string:

```swift
@Test("Withdraw more than balance")
func test_withdraw_amountExceedsBalance_throwsInsufficientFundsError() throws {
    let account = Account(balance: 50)
    #expect(throws: AccountError.insufficientFunds) {
        try account.withdraw(100)
    }
}
```

- `method` — the unit under test (`withdraw`).
- `condition` — the specific input/state (`amountExceedsBalance`).
- `expectedOutcome` — what should happen (`throwsInsufficientFundsError`).

This convention pays off in `git blame`, stack traces, and any tool (CI logs, grep) that shows the Swift symbol rather than the display string. Keep both — the display string is for humans reading Xcode's Test Navigator; the function name is for everything else.

## One logical concept per test

```swift
// Two tests, not one — each fails independently and each name says exactly one thing
@Test func test_createUser_validInput_persistsToRepository() throws {
    let user = try UserFactory.create(name: "Ada", email: "ada@example.com")
    #expect(repository.contains(user))
}

@Test func test_createUser_validInput_sendsWelcomeEmail() throws {
    let user = try UserFactory.create(name: "Ada", email: "ada@example.com")
    #expect(emailService.sentEmails.contains { $0.to == user.email })
}
```

Resist the urge to merge these into one `test_createUser_validInput_persistsAndSendsEmail` — when it fails, you'd have to read the assertion output to know *which* behavior broke; two focused tests tell you immediately from the test name alone.

Multiple `#expect` calls in one test are fine when they're checking facets of the *same* outcome (e.g. several fields of the same returned object) — see the `UserProfile` example in `expectations.md`. The line is whether a reader would describe it as "one behavior" or "two behaviors."

## No control flow in tests

A test with an `if`, `switch`, `for`, or `while` driving which assertion runs is a test hiding multiple behaviors, or a parameterized test that hasn't been extracted yet:

```swift
// Avoid
@Test func test_validateAge_variousInputs_behavesCorrectly() {
    for age in [-1, 0, 17, 18, 150] {
        if age < 0 || age > 120 {
            #expect(AgeValidator.validate(age) == .invalid)
        } else if age < 18 {
            #expect(AgeValidator.validate(age) == .underage)
        } else {
            #expect(AgeValidator.validate(age) == .valid)
        }
    }
}
```

```swift
// Prefer — parameterized, one outcome asserted per case, and each case reports independently
@Test(arguments: [-1, 150])
func test_validateAge_outOfRange_returnsInvalid(_ age: Int) {
    #expect(AgeValidator.validate(age) == AgeValidationResult.invalid)
}

@Test(arguments: [0, 17])
func test_validateAge_belowEighteen_returnsUnderage(_ age: Int) {
    #expect(AgeValidator.validate(age) == AgeValidationResult.underage)
}

@Test func test_validateAge_eighteenOrOlder_returnsValid() {
    #expect(AgeValidator.validate(18) == AgeValidationResult.valid)
}
```

If the branching logic in the test *mirrors* the logic under test, the test isn't actually verifying anything — it's asserting the implementation against itself.

## Suite organization

- Mirror the source tree: `Sources/Features/Checkout/CheckoutService.swift` → `Tests/Features/Checkout/CheckoutServiceTests.swift`.
- One suite per type/unit under test, named `<TypeUnderTest>Tests`. Nested suites (see `fundamentals.md`) for sub-scenarios (`Discounts`, `TaxCalculation`) inside a larger feature suite.
- Keep suite-level fixtures (`init`) minimal — construct only what every test in the suite actually needs. A suite whose `init` builds five collaborators when only one test uses three of them is a sign the suite is grouping unrelated tests.

## Test doubles

- Put mocks/stubs/fakes/spies in `TestDoubles/`, mirroring the project's dependency-injection seams — never hand-roll a new fake inline per test file.
- Prefer fakes (real, simplified implementations — an in-memory repository) over mocks (behavior-verifying stand-ins) where feasible; fakes tend to survive refactors of the interaction pattern, mocks tend to break.
- A test double should implement the same protocol/abstraction the production code depends on — never subclass or partially override the real type.

## Awkward-to-test code is a design problem

If writing the test requires excessive setup, reaching into private state, or heavy mocking of unrelated collaborators, don't reach for more powerful test tooling (reflection, `@testable import` workarounds, partial mocks) to force it through. Fix the seam:

- Extract the untestable logic into a pure function or a small type with an injectable dependency.
- Depend on a protocol instead of a concrete singleton/network client.
- Split a type that's doing too much (a `~300`-line file is the same "too many responsibilities" signal in test files as in production files).

## Avoid over-abstracted test helpers

Three similar test bodies with slightly different data are better served by `@Test(arguments:)` than by a hand-rolled `runStandardValidationTest(input:expected:)` helper — the parameterized form keeps failures attributable to a specific case automatically, while a custom helper hides that bookkeeping and often ends up with its own bugs.
