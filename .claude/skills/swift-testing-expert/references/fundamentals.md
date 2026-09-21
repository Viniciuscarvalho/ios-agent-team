# Fundamentals

## Anatomy of a test

Any top-level or type-member function annotated `@Test` is a test. It can be synchronous or `async`, throwing or non-throwing:

```swift
import Testing

@Test func test_add_twoPositiveIntegers_returnsSum() {
    // Arrange
    let calculator = Calculator()

    // Act
    let result = calculator.add(2, 3)

    // Assert
    #expect(result == 5)
}
```

- No `XCTestCase` subclass, no `test` prefix requirement on the function name (the macro marks it), no registration step.
- A free function `@Test` runs standalone, outside any suite.
- Give a test a human-readable display name as the first macro argument — it shows up in Xcode's Test Navigator and CLI output, independent of the Swift function name:

```swift
@Test("Adding two positive integers returns their sum")
func test_add_twoPositiveIntegers_returnsSum() {
    #expect(Calculator().add(2, 3) == 5)
}
```

Keep the Swift name in `test_method_condition_expectedOutcome` form even when you add a display string — the function name is what shows up in stack traces, `git blame`, and non-Xcode consumers of the source.

## Suites

`@Suite` groups related tests under a type. Use a `struct` unless you need reference semantics or `deinit`:

```swift
@Suite("Shopping cart")
struct ShoppingCartTests {
    let cart = ShoppingCart()

    @Test func test_addItem_singleItem_increasesTotalByItemPrice() {
        cart.add(Item(name: "Book", price: 12))
        #expect(cart.total == 12)
    }

    @Test func test_removeItem_itemNotInCart_doesNothingAndReturnsFalse() {
        let removed = cart.remove(Item(name: "Ghost", price: 0))
        #expect(removed == false)
    }
}
```

- `@Suite` on a type is optional if the type only contains `@Test` members and no shared traits — Swift Testing infers a suite automatically. Add the attribute explicitly when you want a display name or suite-level traits (e.g. `.tags(...)`, `.serialized`).
- Suites nest via nested types:

```swift
@Suite("Checkout")
struct CheckoutTests {
    @Suite("Discounts")
    struct DiscountTests {
        @Test func test_applyDiscount_validCode_reducesTotal() { /* ... */ }
    }
}
```

## Instance lifecycle replaces setUp/tearDown

For a `struct` or `class` suite, **Swift Testing creates a brand-new instance for every `@Test` in it** — there is no shared mutable state between tests unless you deliberately inject something external (a database file, a singleton). This is what makes parallel execution safe by default; see `parallelization-and-isolation.md`.

```swift
@Suite
struct DatabaseTests {
    let database: Database

    init() {
        // Arrange, runs before every test in this suite
        database = Database(path: .temporaryDirectory)
    }

    @Test func test_insert_singleRecord_isRetrievable() {
        database.insert(Record(id: 1))
        #expect(database.fetch(id: 1) != nil)
    }
}
```

- `init` can be `async throws` if setup needs to await work or can fail — Swift Testing awaits/propagates it per test.
- For teardown, use `deinit` on a `class` suite (structs have no `deinit`); prefer scoping cleanup with `defer` inside the test itself, or a `TestScoping` trait (see `traits-and-tags.md`) for cross-cutting teardown.

```swift
@Suite
final class TempFileTests {
    let fileURL: URL

    init() {
        fileURL = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    }

    deinit {
        try? FileManager.default.removeItem(at: fileURL)
    }

    @Test func test_write_thenRead_roundTripsContent() throws {
        try "hello".write(to: fileURL, atomically: true, encoding: .utf8)
        let contents = try String(contentsOf: fileURL, encoding: .utf8)
        #expect(contents == "hello")
    }
}
```

## Arrange-Act-Assert in Swift Testing

Structure every test body in three visually distinct blocks. Blank lines (and optional `// Arrange` / `// Act` / `// Assert` markers when the split isn't obvious) are enough — no framework support needed:

```swift
@Test func test_withdraw_sufficientBalance_reducesBalanceByAmount() throws {
    // Arrange
    let account = Account(balance: 100)

    // Act
    try account.withdraw(40)

    // Assert
    #expect(account.balance == 60)
}
```

- One logical concept per test. If "Act" needs more than a couple of lines, or "Assert" checks unrelated outcomes, split into separate tests — see `performance-and-best-practices.md`.
- Never branch (`if`/`switch`/loops driving assertions) inside a test body. If you need to check the same assertion for multiple inputs, that's what `parameterized-testing.md` is for.

## Free functions vs. methods

Free `@Test` functions are fine for one-off tests with no shared fixture. Once you have two or more tests sharing setup, promote them into a `@Suite` — it documents the relationship and lets you attach suite-level traits (tags, `.serialized`) once instead of per test.
