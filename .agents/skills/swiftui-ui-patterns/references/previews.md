# `#Preview` Patterns & Mock Data

The `#Preview` macro (Swift 5.9+/Xcode 15+) replaces `PreviewProvider` boilerplate. Every view worth reviewing in isolation should ship with at least one preview using realistic mock data — previews are cheap, fast feedback that catch layout regressions before a simulator run.

## Basic preview

```swift
#Preview {
    RecipeRow(recipe: .mock)
}
```

Prefer a static mock on the model itself over inline literals scattered across preview call sites — one canonical mock, reused everywhere:

```swift
extension Recipe {
    static let mock = Recipe(
        id: UUID(),
        title: "Weeknight Pasta",
        imageURL: URL(string: "https://example.com/pasta.jpg"),
        cookTimeMinutes: 25
    )
}
```

## Multiple named previews for state coverage

Cover the states that matter for that view — at minimum, loaded, empty, and error where the view has async state (see `references/async-state.md`):

```swift
#Preview("Loaded") {
    RecipeListView(viewModel: .mock(state: .loaded(.mockList)))
}

#Preview("Empty") {
    RecipeListView(viewModel: .mock(state: .loaded([])))
}

#Preview("Error") {
    RecipeListView(viewModel: .mock(state: .failed(PreviewError.generic)))
}

#Preview("Loading") {
    RecipeListView(viewModel: .mock(state: .loading))
}
```

Give the view model (or its protocol) a test/preview-only initializer that seeds state directly, rather than routing preview data through a real async `load()` call:

```swift
extension RecipeListViewModel {
    static func mock(state: LoadState<[Recipe]>) -> RecipeListViewModel {
        let viewModel = RecipeListViewModel(repository: InMemoryRecipeRepository(seed: []))
        viewModel.state = state
        return viewModel
    }
}
```

## Previewing with environment dependencies

Views that read `@Environment(AppDependencies.self)` need that environment supplied in the preview, using the `.preview()` dependency graph from `references/app-wiring.md`:

```swift
#Preview {
    RecipeListView()
        .environment(AppDependencies.preview())
        .environment(AppRouter())
}
```

## Preview traits: size, color scheme, dynamic type

Use preview traits to check a view under the conditions that most commonly break layout — don't rely on a single default-size preview as "done":

```swift
#Preview("Dark Mode", traits: .fixedLayout(width: 375, height: 200)) {
    RecipeRow(recipe: .mock)
        .preferredColorScheme(.dark)
}

#Preview("Large Text") {
    RecipeRow(recipe: .mock)
        .environment(\.dynamicTypeSize, .accessibility3)
}

#Preview("iPad Landscape", traits: .landscapeLeft) {
    RecipeListView()
        .environment(AppDependencies.preview())
}
```

## Preview-only sample data containers

For SwiftData/Core Data-backed views, build a dedicated in-memory container so previews never touch the real persistent store:

```swift
#Preview {
    let container = try! ModelContainer(
        for: Recipe.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )
    container.mainContext.insert(Recipe.mock)

    return RecipeListView()
        .modelContainer(container)
}
```

## Keep preview mock data next to the type it mocks

Put `static let mock` / `static func mock(...)` extensions in the same file as the type, guarded if needed, rather than in a separate "TestData.swift" dumping ground — it keeps the mock in sync when the type's shape changes, and makes it discoverable via autocomplete at the call site.

## Common pitfalls

- **Previews that hit the network or real repository.** Any preview whose `body` triggers a live API call is slow, flaky in CI/canvas, and leaks test traffic — always inject an in-memory/mock dependency.
- **One "kitchen sink" preview instead of named state previews.** A single preview with the happy-path only preview will not catch the empty-list `List` rendering nothing, or the error view's text overflowing.
- **Forgetting Dynamic Type and dark mode.** These are the two conditions most likely to reveal a layout bug that a default preview won't show.
