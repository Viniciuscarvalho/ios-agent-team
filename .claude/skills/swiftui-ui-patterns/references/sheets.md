# Sheets, Full-Screen Covers & Presentation Detents

Modal presentation in SwiftUI is state-driven: a `Bool` or optional `Item` controls whether the sheet is visible, and SwiftUI handles the transition. Never call an imperative "present" API — bind presentation to a value.

## `.sheet` with a Boolean

```swift
struct RecipeListView: View {
    @State private var isPresentingFilter = false

    var body: some View {
        List { /* ... */ }
            .sheet(isPresented: $isPresentingFilter) {
                FilterView()
            }
    }
}
```

## `.sheet(item:)` — the preferred form when content depends on data

Use `sheet(item:)` whenever the sheet's content depends on a specific value. It removes an entire class of bugs where the `Bool` flips true but the associated data is stale or nil:

```swift
struct RecipeListView: View {
    @State private var selectedRecipe: Recipe?

    var body: some View {
        List(recipes) { recipe in
            Button(recipe.title) { selectedRecipe = recipe }
        }
        .sheet(item: $selectedRecipe) { recipe in
            RecipeDetailView(recipe: recipe)
        }
    }
}
```

`Recipe` must be `Identifiable`. When the sheet is dismissed (swipe or programmatically), SwiftUI sets `selectedRecipe` back to `nil` automatically.

## `.fullScreenCover`

Same API shape as `.sheet`, but with no drag-to-dismiss affordance and no card presentation — use it for flows that must be explicitly completed or cancelled (onboarding, camera, paywalls):

```swift
.fullScreenCover(isPresented: $isPresentingOnboarding) {
    OnboardingFlow()
}
```

Always give a `fullScreenCover` an explicit dismiss action in its own UI (a close button or a completion callback) since there's no swipe gesture.

## Presentation detents

`presentationDetents` sets the set of heights a sheet can rest at. `PresentationDetent` has these members: `.medium`, `.large`, `.height(_:)`, `.fraction(_:)`, and `.custom(_:)` for a resolver-driven detent.

```swift
.sheet(isPresented: $isPresentingFilter) {
    FilterView()
        .presentationDetents([.medium, .large])
}
```

### Reading and controlling the active detent

Bind a `PresentationDetent` to observe or programmatically change which detent is active:

```swift
struct FilterSheet: View {
    @State private var detent: PresentationDetent = .medium

    var body: some View {
        FilterView()
            .presentationDetents([.medium, .large], selection: $detent)
            .presentationDragIndicator(.visible)
    }
}
```

Drive the initial detent from content: if a form has few fields, start at `.medium`; expand to `.large` once the user starts typing by setting `detent = .large` in a `.onChange(of:)`.

### Custom fractional/height detents and content-driven sizing

For a detent that depends on the sheet's own content height (e.g., "just tall enough for this list"), read the content size with `.presentationDetents([.height(contentHeight)])` where `contentHeight` comes from a measured value, or define a `CustomPresentationDetent` for calculations based on the presenting container's size class.

```swift
.sheet(isPresented: $isPresentingActionMenu) {
    ActionMenuView()
        .presentationDetents([.fraction(0.35)])
        .presentationCornerRadius(24)
        .presentationBackground(.thickMaterial)
}
```

### Other presentation modifiers worth knowing

- `.presentationDragIndicator(.visible)` — show the grabber even when a detent selection binding exists (SwiftUI hides it in some configurations by default).
- `.interactiveDismissDisabled(_:)` — block swipe-to-dismiss while a required form is incomplete; pair with an explicit cancel/save button so the sheet is never a dead end.
- `.presentationCompactAdaptation(_:)` — control whether a `.popover` collapses to a sheet on compact width classes.
- `.presentationBackgroundInteraction(.enabled(upThrough:))` — let the user interact with content behind a partial-height sheet (maps view style).

## Nesting a NavigationStack inside a sheet

A sheet that hosts a multi-step flow (e.g., "add item" with several fields across screens) should have its own internal `NavigationStack`, separate from the presenting screen's stack:

```swift
.sheet(isPresented: $isAddingRecipe) {
    NavigationStack {
        AddRecipeStepOneView()
    }
}
```

Do **not** let a sheet's internal navigation destinations resolve against the presenting view's `navigationDestination` registrations — they're different stacks and won't see each other's destinations. Register `navigationDestination` inside the sheet's own `NavigationStack`.

## Choosing between sheet, full-screen cover, and push

| Use | When |
|---|---|
| `.sheet` | Optional, dismissible task: filters, quick actions, secondary info |
| `.fullScreenCover` | Mandatory, self-contained flow: onboarding, auth, camera |
| Push (`NavigationStack`) | Continuation of the current task, back button expected |

If a "sheet" grows past 2-3 steps and starts feeling like a stack of screens the user should be able to go *back* through (not just cancel out of), it usually means the flow belongs behind a push, not a modal. See `references/navigationstack.md`.
