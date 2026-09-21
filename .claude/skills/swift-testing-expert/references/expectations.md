# Expectations: `#expect` and `#require`

Swift Testing replaces the entire `XCTAssert*` family with two macros. Both take a plain Swift boolean expression — no need for `XCTAssertEqual`-style paired arguments, because the macro rewrites the expression at compile time to capture both sides for the failure message.

## `#expect` — record and continue

```swift
@Test func test_divide_byNonZero_returnsQuotient() {
    let result = Math.divide(10, by: 2)
    #expect(result == 5)
}
```

If `result == 5` is false, the test fails, the failure is recorded with the actual values of `result` and `5` captured automatically (no need to write a message), and **the test function keeps running** — later expectations in the same test still execute.

Use `#expect` for the normal case: independent assertions where you want to see every failure in one run rather than stopping at the first.

```swift
@Test func test_userProfile_afterUpdate_hasNewValues() {
    let profile = UserProfile(name: "Ada", age: 30)
    profile.update(name: "Grace", age: 31)

    #expect(profile.name == "Grace")
    #expect(profile.age == 31)
}
```

Both lines run and report independently, even if the first fails.

## `#require` — assert and stop

```swift
@Test func test_parseURL_validString_producesHost() throws {
    let url = try #require(URL(string: "https://example.com/path"))
    #expect(url.host == "example.com")
}
```

`#require` throws an error the instant the condition is false (or the optional is `nil`), aborting the test immediately. Use it exactly when a later line cannot meaningfully execute without the value:

- Unwrapping an optional you are about to use.
- A precondition that, if false, makes every subsequent assertion meaningless or crash-prone.

```swift
@Test func test_fetchUser_existingID_returnsPopulatedUser() async throws {
    let user = try await userService.fetchUser(id: 42)
    let user = try #require(user)          // stop here if nil — nothing else can run
    #expect(user.id == 42)
    #expect(user.email.contains("@"))
}
```

A test function that calls `#require` must be marked `throws` (or `async throws`).

## Custom failure messages

Append a message as the last argument — it only appears in the failure output, not on success:

```swift
#expect(user.age >= 18, "Users under 18 should be rejected by the age gate")
```

Messages are `@autoclosure`, so string interpolation or expensive formatting only runs on failure:

```swift
#expect(cache.count <= maxCacheSize, "Cache exceeded limit: \(cache.count) > \(maxCacheSize)")
```

## Comparing optionals

Prefer comparing the optional directly over unwrapping when you don't need the value afterward:

```swift
@Test func test_findUser_unknownID_returnsNil() {
    #expect(repository.findUser(id: -1) == nil)
}
```

When you do need the unwrapped value for further assertions, use `#require`, not `!`:

```swift
@Test func test_findUser_knownID_returnsMatchingUser() throws {
    let user = try #require(repository.findUser(id: 1))
    #expect(user.name == "Ada")
}
```

## Comparing collections

`#expect` works directly on `Equatable` collections — no `XCTAssertEqual(array1, array2)` ceremony, and no need for `sorted()` gymnastics beyond what `Equatable` already gives you:

```swift
@Test func test_sort_unsortedIntegers_returnsAscendingOrder() {
    let result = [3, 1, 2].sorted()
    #expect(result == [1, 2, 3])
}
```

For unordered comparisons, compare `Set`s explicitly:

```swift
@Test func test_uniqueTags_duplicateInput_removesDuplicates() {
    let result = TagSet(["a", "b", "a"]).uniqueTags
    #expect(Set(result) == Set(["a", "b"]))
}
```

For partial checks on a collection, assert on the specific property instead of the whole collection:

```swift
@Test func test_searchResults_query_containsExpectedItem() {
    let results = search("swift")
    #expect(results.contains(where: { $0.title == "Swift Testing" }))
}
```

## Comparing floating point values

Use `isApproximatelyEqual` semantics manually, or a tolerance comparison — Swift Testing does not add its own `AccuracyEqual` macro:

```swift
@Test func test_average_threeValues_isWithinTolerance() {
    let result = Statistics.average([1.1, 2.2, 3.3])
    #expect(abs(result - 2.2) < 0.0001)
}
```

## Asserting thrown errors

`#expect(throws:)` checks that an expression throws a specific error (or any error, or no error):

```swift
@Test func test_withdraw_insufficientFunds_throwsInsufficientFundsError() {
    let account = Account(balance: 10)
    #expect(throws: AccountError.insufficientFunds) {
        try account.withdraw(100)
    }
}
```

Variants:

```swift
#expect(throws: (any Error).self) { try riskyOperation() }   // any error
#expect(throws: Never.self) { try safeOperation() }          // must not throw
```

To inspect the thrown error's payload, capture it with `#require(throws:)`:

```swift
@Test func test_parse_malformedJSON_throwsWithOffendingSnippet() {
    let error = #require(throws: ParsingError.self) {
        try JSONParser.parse(malformedData)
    }
    #expect(error.offendingSnippet == "{\"bad\"")
}
```

## One assertion style, one test file

Don't mix `XCTAssert*` and `#expect`/`#require` in the same file — it signals an incomplete migration and confuses readers about which framework's semantics apply (continue-on-failure vs. stop-on-failure). See `migration-from-xctest.md` for the conversion table.
