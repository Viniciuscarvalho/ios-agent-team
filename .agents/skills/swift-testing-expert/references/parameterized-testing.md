# Parameterized testing

When several tests differ only in their input and expected output, replace them with one `@Test(arguments:)` function instead of copy-pasting the test body.

## Single collection

```swift
@Test("Doubling a value", arguments: [1, 2, 3, 4])
func test_double_positiveInteger_returnsTwiceTheValue(_ input: Int) {
    #expect(Math.double(input) == input * 2)
}
```

Swift Testing runs the test once per element, passing each element as the sole argument. Each element is reported as its own test case — a failure on `input == 3` doesn't stop the case for `input == 4`, and both show up individually in Xcode's Test Navigator and CLI output.

Any `Sequence` works, not just arrays — including `Set`, a `Range`, or a dictionary's `.keys`:

```swift
@Test("Validating known invalid emails", arguments: [
    "no-at-sign.com",
    "@missing-local-part.com",
    "trailing-dot.com.",
])
func test_isValidEmail_malformedAddress_returnsFalse(_ email: String) {
    #expect(EmailValidator.isValid(email) == false)
}
```

## Multiple collections — Cartesian product

Passing two collections runs the test for **every combination** of elements — the first collection maps to the first parameter, the second to the second:

```swift
@Test(arguments: ["chocolate", "vanilla", "strawberry"], 1...3)
func test_orderIceCream_flavorAndScoopCount_producesValidOrder(flavor: String, scoops: Int) {
    let order = IceCreamOrder(flavor: flavor, scoops: scoops)
    #expect(order.isValid)
}
```

This runs 3 × 3 = 9 cases. Cartesian expansion is powerful but grows fast — five inputs crossed with a hundred values is 500 test cases. Use it deliberately when you actually want full coverage of the combination space (e.g. exhaustive boundary testing), not by accident.

## Paired arguments with `zip`

When you want inputs and their expected outputs to travel together — not be cross-multiplied — zip the collections before passing them:

```swift
@Test(arguments: zip(
    ["chocolate", "vanilla", "strawberry"],
    [Decimal(4.50), Decimal(3.75), Decimal(4.25)]
))
func test_priceForFlavor_knownFlavor_returnsExpectedPrice(flavor: String, expectedPrice: Decimal) {
    #expect(PriceList.price(for: flavor) == expectedPrice)
}
```

This runs exactly 3 cases (one per pair), not 9. `zip` "destructures" the resulting tuple sequence automatically into the test function's parameters — no manual `.0`/`.1` unpacking needed.

Swift's standard `zip` only pairs two sequences. For three or more parallel collections, nest `zip` calls and destructure the nested tuple:

```swift
@Test(arguments: zip(zip(
    ["chocolate", "vanilla", "strawberry"],
    [Decimal(4.50), Decimal(3.75), Decimal(4.25)]
), [true, true, false]))
func test_flavorPricingAndAvailability_knownFlavor_matchesCatalog(
    _ flavorAndPrice: (flavor: String, price: Decimal),
    _ isAvailable: Bool
) {
    #expect(PriceList.price(for: flavorAndPrice.flavor) == flavorAndPrice.price)
    #expect(PriceList.isAvailable(flavorAndPrice.flavor) == isAvailable)
}
```

If you find yourself nesting `zip` more than once, define a small `Sendable` struct for the test case instead — it reads better than nested tuples:

```swift
struct FlavorCase: Sendable {
    let flavor: String
    let price: Decimal
    let isAvailable: Bool
}

@Test(arguments: [
    FlavorCase(flavor: "chocolate", price: 4.50, isAvailable: true),
    FlavorCase(flavor: "vanilla", price: 3.75, isAvailable: true),
    FlavorCase(flavor: "strawberry", price: 4.25, isAvailable: false),
])
func test_flavorPricingAndAvailability_knownFlavor_matchesCatalog(_ testCase: FlavorCase) {
    #expect(PriceList.price(for: testCase.flavor) == testCase.price)
    #expect(PriceList.isAvailable(testCase.flavor) == testCase.isAvailable)
}
```

## Enum-driven parameterization

`CaseIterable` enums are a natural fit — no need to maintain a separate array of cases:

```swift
enum Direction: CaseIterable {
    case north, south, east, west
}

@Test(arguments: Direction.allCases)
func test_move_everyDirection_updatesPositionAccordingly(_ direction: Direction) {
    let player = Player(position: .origin)
    player.move(direction)
    #expect(player.position != .origin)
}
```

## Argument requirements

- Each argument type must be `Sendable` — test cases can run concurrently (see `parallelization-and-isolation.md`), so the values cross task boundaries.
- Prefer `CustomTestStringConvertible` on argument types whose default description is unhelpful in failure output (e.g. a large struct) — implement `var testDescription: String` to control what shows up per case.
- Avoid combinatorially huge or unbounded ranges (`0..<Int.max`) as arguments — Swift Testing will try to enumerate them, which can hang or exhaust resources. Pick representative boundary values instead.

## When not to parameterize

If the test bodies for each "case" actually exercise different code paths (not just different data through the same path), keep them as separate `@Test` functions with distinct names — parameterizing would hide that they're testing different behavior.
