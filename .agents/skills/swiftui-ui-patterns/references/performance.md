# View Identity, `Equatable`, and Avoiding Unnecessary Re-Renders

SwiftUI re-evaluates a view's `body` whenever any state it reads changes — the goal of performance work is almost always **narrowing what a view reads**, not micro-optimizing the body itself.

## Identity drives diffing, not equality

SwiftUI decides whether a view is "the same view, updated" or "a new view, old one destroyed" based on **structural identity** (position in the view tree + explicit `id`), not content equality. Getting this wrong is the single most common cause of dropped animations, reset `@State`, and flicker.

```swift
ForEach(recipes) { recipe in       // uses Recipe: Identifiable, keyed by `id`
    RecipeRow(recipe: recipe)
}
```

Never key a `ForEach`/`List` by array index when the array can reorder, insert, or delete — index-based identity makes SwiftUI think row *3* changed content, when actually row *3* is now a different recipe entirely, and any `@State` inside that row (like an "expanded" toggle) will appear to jump to the wrong item:

```swift
// Wrong: identity tied to position, not to the recipe.
ForEach(Array(recipes.enumerated()), id: \.offset) { _, recipe in
    RecipeRow(recipe: recipe)
}
```

Use `.id(_:)` deliberately to *force* identity to change (and thus force a fresh view, resetting its `@State`) — e.g., when a detail view should fully reset when navigating between sibling items:

```swift
RecipeDetailView(recipe: recipe)
    .id(recipe.id)
```

## Narrow what a view observes

`@Observable` (Swift Observation, iOS 17+) already tracks property-level access — a view only re-renders for the *specific* properties its `body` reads, not every mutation on the object. But this guarantee only holds if the view reads through the object directly in `body`; passing the whole object down and reading it in a computed property outside `body`, or capturing it in a closure that recomputes elsewhere, can widen what triggers a re-render.

```swift
@Observable
final class RecipeListViewModel {
    var recipes: [Recipe] = []
    var searchText: String = ""       // unrelated to `recipes`
}

struct RecipeCountLabel: View {
    let viewModel: RecipeListViewModel

    var body: some View {
        // Only re-renders when `recipes` changes, not when `searchText` changes,
        // because Observation tracks the specific property accessed here.
        Text("\(viewModel.recipes.count) recipes")
    }
}
```

Split a large `@Observable` model into smaller, focused ones when unrelated pieces of state (search text vs. loaded data vs. selection) are read by different, disjoint sets of views — otherwise every view holding a reference re-evaluates its `body` on any tracked-property write, even ones it never reads (Observation avoids re-render on *untracked* writes, but doesn't help once a view's `body` legitimately reads multiple unrelated properties on the same object).

## `Equatable` views

Conform a view to `Equatable` and apply `.equatable()` when its `body` is expensive to recompute and its inputs are simple value types — SwiftUI then skips re-evaluating `body` if the new value compares equal to the old one, even if the parent re-rendered:

```swift
struct RecipeThumbnail: View, Equatable {
    let recipe: Recipe

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.recipe.id == rhs.recipe.id && lhs.recipe.imageURL == rhs.recipe.imageURL
    }

    var body: some View {
        AsyncImage(url: recipe.imageURL) { /* ... */ }
    }
}
```

```swift
RecipeThumbnail(recipe: recipe)
    .equatable()
```

Reach for this only after profiling shows a specific view's `body` re-running unnecessarily and expensively (Instruments' SwiftUI template, "Update" reasons) — applying `.equatable()` everywhere adds comparison overhead without benefit for cheap views.

## Avoid `AnyView` and type-erasure in hot paths

`AnyView` erases the underlying view's static type, which defeats SwiftUI's ability to diff efficiently — every update to an `AnyView`-wrapped subtree is treated closer to "replace it," not "diff it." Prefer `@ViewBuilder` functions/computed properties or `Group` with `if`/`switch` to keep static type information:

```swift
// Avoid: erases type identity across re-renders.
func makeRow(for recipe: Recipe) -> AnyView {
    if recipe.isFavorite {
        return AnyView(FavoriteRecipeRow(recipe: recipe))
    }
    return AnyView(RecipeRow(recipe: recipe))
}

// Prefer: `@ViewBuilder` preserves the conditional's branches as distinct, diffable types.
@ViewBuilder
func row(for recipe: Recipe) -> some View {
    if recipe.isFavorite {
        FavoriteRecipeRow(recipe: recipe)
    } else {
        RecipeRow(recipe: recipe)
    }
}
```

## Lazy containers for large content

`LazyVStack`/`LazyHStack`/`LazyVGrid` only instantiate the views for content near the visible area, unlike `VStack`/`HStack`, which build all children eagerly regardless of visibility. Any scrollable collection beyond a couple dozen items belongs in a lazy container or `List`:

```swift
ScrollView {
    LazyVStack(spacing: 12) {
        ForEach(recipes) { recipe in
            RecipeRow(recipe: recipe)
        }
    }
}
```

## Diagnosing re-render issues

- Instruments' **SwiftUI** template shows per-view update counts and reasons — use it before guessing which view is the problem.
- A quick manual signal: add a `let _ = Self._printChanges()` at the top of a suspect view's `body` (debug builds only, remove before committing) to log what triggered that specific update.
- Watch for a parent passing a large struct (or its whole `@Observable` model) into a child that only needs one field — narrowing the parameter to that one field lets the child's identity/equality checks (and Observation tracking) do their job.

## Common pitfalls

- **Index-keyed `ForEach` on mutable collections.** Breaks state and animation identity on reorder/insert/delete.
- **One giant `@Observable` app-state object read broadly.** Widens the blast radius of every mutation; split by concern.
- **Reaching for `.equatable()` or manual diffing before profiling.** Adds complexity and comparison cost without a measured problem to justify it.
