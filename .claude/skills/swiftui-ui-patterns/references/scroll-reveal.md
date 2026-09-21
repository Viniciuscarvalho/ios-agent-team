# Scroll-Triggered Animation & Reveal Effects

iOS 18 introduced two APIs purpose-built for scroll-driven UI: `.scrollTransition` for per-item appearance changes as content moves through the visible region, and `.onScrollGeometryChange` for reading continuous scroll geometry without a `GeometryReader` + `PreferenceKey` workaround. Both are Available on iOS 18 / iPadOS 18 / macOS 15+.

## `.scrollTransition`: per-item reveal as content scrolls

`.scrollTransition` animates a view between phases as it enters, sits within, and leaves the scroll view's visible region — it replaces the old pattern of computing offset manually via `GeometryReader` inside every row.

```swift
enum ScrollTransitionPhase {
    case topLeading    // approaching/past the leading edge of the visible region
    case identity      // fully within the visible region
    case bottomTrailing // approaching/past the trailing edge
}
```

```swift
ScrollView {
    LazyVStack(spacing: 16) {
        ForEach(recipes) { recipe in
            RecipeCard(recipe: recipe)
                .scrollTransition { content, phase in
                    content
                        .opacity(phase == .identity ? 1 : 0.3)
                        .scaleEffect(phase == .identity ? 1 : 0.85)
                        .blur(radius: phase == .identity ? 0 : 4)
                }
        }
    }
    .padding()
}
```

The closure receives the content and a `ScrollTransitionPhase`; return the content with modifiers applied conditionally on the phase. SwiftUI interpolates between phases as the view crosses the visible region's edges, so the effect animates smoothly with scroll velocity — no manual animation curve needed.

### Directional variant

Use the `topLeading:bottomTrailing:axis:transition:` overload when you want different treatment depending on which edge the view is approaching (e.g., fade in from the bottom but not from the top, for a "reveal on the way down" feel):

```swift
RecipeCard(recipe: recipe)
    .scrollTransition(topLeading: .interactive, bottomTrailing: .animated, axis: .vertical) { content, phase in
        content
            .opacity(phase.isIdentity ? 1 : 0)
            .offset(y: phase == .bottomTrailing ? 0 : 24)
    }
```

Keep the transformation cheap (opacity, scale, offset, blur) — this closure runs on every scroll frame for every visible-adjacent view, so avoid expensive layout recomputation inside it.

## `.onScrollGeometryChange`: reading scroll position without boilerplate

`onScrollGeometryChange(for:of:action:)` reports a transformed, `Equatable` value derived from `ScrollGeometry`, and only calls your action when that derived value actually changes — you don't get called on every pixel of scroll, only on meaningful transitions you define:

```swift
struct ScrollGeometry {
    var contentOffset: CGPoint
    var contentSize: CGSize
    var contentInsets: EdgeInsets
    var containerSize: CGSize
    var visibleRect: CGRect
    var bounds: CGRect
}
```

```swift
struct StickyHeaderScrollView: View {
    @State private var isScrolledPastHeader = false

    var body: some View {
        ScrollView {
            HeaderView()
            LazyVStack {
                ForEach(recipes) { recipe in
                    RecipeRow(recipe: recipe)
                }
            }
        }
        .onScrollGeometryChange(for: Bool.self) { geometry in
            geometry.contentOffset.y > 180
        } action: { _, isPast in
            isScrolledPastHeader = isPast
        }
        .toolbar {
            if isScrolledPastHeader {
                ToolbarItem(placement: .principal) {
                    Text("Recipes").font(.headline)
                }
            }
        }
    }
}
```

Note the two-parameter `action` closure form: `(oldValue, newValue)`. Deriving a `Bool`/`CGFloat`/custom `Equatable` struct in the `for:` transform — rather than passing the raw `ScrollGeometry` through — is what lets SwiftUI dedupe and avoid firing your action every frame.

### Parallax header driven by geometry

```swift
struct ParallaxHeader: View {
    @State private var offsetY: CGFloat = 0

    var body: some View {
        ScrollView {
            Color.clear.frame(height: 0)
                .onScrollGeometryChange(for: CGFloat.self) { geometry in
                    geometry.contentOffset.y
                } action: { _, newOffset in
                    offsetY = newOffset
                }

            HeaderImage()
                .scaleEffect(offsetY < 0 ? 1 + (-offsetY / 300) : 1)
                .offset(y: offsetY < 0 ? offsetY / 2 : 0)

            content
        }
    }
}
```

## Programmatic scrolling: `ScrollView` + `scrollPosition`

Pair reveal effects with `scrollPosition(id:)` when you need to programmatically scroll to a specific item (e.g., "jump to today" in a calendar-like list):

```swift
struct AgendaView: View {
    @State private var scrolledID: Recipe.ID?

    var body: some View {
        ScrollView {
            LazyVStack {
                ForEach(recipes) { recipe in
                    RecipeRow(recipe: recipe)
                        .id(recipe.id)
                }
            }
        }
        .scrollPosition(id: $scrolledID)
        .toolbar {
            Button("Jump to Favorite") {
                withAnimation {
                    scrolledID = favoriteRecipeID
                }
            }
        }
    }
}
```

## Pre-iOS 18 fallback

If the minimum deployment target is below iOS 18, `.scrollTransition` and `.onScrollGeometryChange` aren't available — fall back to `GeometryReader` inside a `.background` plus a `PreferenceKey` to bubble up frame data, or gate the enhancement behind `if #available(iOS 18, *)` so the base experience still works on older OS versions without the reveal polish.

```swift
if #available(iOS 18, *) {
    RecipeCard(recipe: recipe)
        .scrollTransition { content, phase in
            content.opacity(phase == .identity ? 1 : 0.3)
        }
} else {
    RecipeCard(recipe: recipe)
}
```

## Common pitfalls

- **Expensive work inside `.scrollTransition`'s closure.** It runs per-frame per-visible-adjacent-view; keep it to simple modifiers.
- **Reading raw `ScrollGeometry` in `onScrollGeometryChange`'s `for:` transform and returning it unchanged.** That defeats the dedup — always project down to the smallest `Equatable` value that captures what you care about.
- **Mixing manual `GeometryReader` offset tracking with the new APIs in the same scroll view.** Pick one mechanism per effect; combining both is a common source of jitter from double-counted offsets.
