# Scroll Patterns

## `ScrollView` basics

`ScrollView` lays out its content eagerly unless the content itself is lazy (`LazyVStack`, `LazyHStack`, `LazyVGrid`). A plain `VStack` inside a `ScrollView` renders every child up front — fine for small, bounded content; wrong for long feeds.

```swift
struct SimpleScrollView: View {
    var body: some View {
        ScrollView(.vertical) {
            VStack(spacing: 16) {
                HeaderView()
                SummaryCardView()
                DetailCardView()
            }
            .padding()
        }
    }
}
```

## `LazyVStack` inside `ScrollView` vs `List`

Use `LazyVStack` in a `ScrollView` when you need custom row backgrounds, non-standard separators, multi-axis layouts, or interleaved section headers that don't map to `List`'s row model. Use `List` when the content is a straightforward, homogeneous, selectable/swipeable/deletable row list — you get platform-correct swipe actions, `.searchable` integration, sidebar styling, and cell reuse for free.

```swift
struct FeedView: View {
    let posts: [Post]

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12, pinnedViews: [.sectionHeaders]) {
                Section {
                    ForEach(posts) { post in
                        PostRowView(post: post)
                    }
                } header: {
                    FeedHeaderView()
                        .background(.bar)
                }
            }
        }
    }
}
```

`LazyVStack` only instantiates rows near the visible viewport, so it scales the same way `List` does for large collections — the choice is about presentation control, not performance, once both are lazy.

## Snap scrolling with `.scrollTargetBehavior`

Mark the lazy stack as the scroll target layout, then choose a behavior. `.paging` snaps one full page (container width) at a time; `.viewAligned` snaps to the leading edge of whichever child is closest, which is the right choice for carousels with partially visible neighboring items.

```swift
struct PagingCarouselView: View {
    let items: [FeatureItem]

    var body: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
                ForEach(items) { item in
                    FeatureCardView(item: item)
                        .containerRelativeFrame(.horizontal)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
    }
}

struct ViewAlignedCarouselView: View {
    let items: [FeatureItem]

    var body: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 12) {
                ForEach(items) { item in
                    FeatureCardView(item: item)
                        .containerRelativeFrame(.horizontal, count: 3, spacing: 12)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.viewAligned)
        .contentMargins(.horizontal, 16, for: .scrollContent)
    }
}
```

For grouped view-aligned snapping (e.g. always land on a full "row" of two cards rather than any single card), use `.viewAligned(limitBehavior: .always)` or `.viewAligned(limitBehavior: .alwaysByFew)`.

## `.scrollPosition(id:)` for programmatic tracking and setting

Bind scroll position to an identifier of your model's `ID` type. Reading the binding tells you which item is currently aligned to the leading edge; writing it scrolls there.

```swift
struct TrackedFeedView: View {
    let posts: [Post]
    @State private var scrolledPostID: Post.ID?

    var body: some View {
        ScrollView {
            LazyVStack {
                ForEach(posts) { post in
                    PostRowView(post: post)
                        .id(post.id)
                }
            }
            .scrollTargetLayout()
        }
        .scrollPosition(id: $scrolledPostID)
        .onChange(of: scrolledPostID) { _, newID in
            markAsSeenIfNeeded(newID)
        }
    }

    private func markAsSeenIfNeeded(_ id: Post.ID?) {
        // Update read-state via a repository, not view state.
    }
}
```

### Scroll-to-top coordination

Drive the same binding from a toolbar action or a tap on the navigation bar title to scroll back to the first item, with animation:

```swift
struct ScrollToTopView: View {
    let posts: [Post]
    @State private var scrolledPostID: Post.ID?

    var body: some View {
        ScrollView {
            LazyVStack {
                ForEach(posts) { post in
                    PostRowView(post: post).id(post.id)
                }
            }
            .scrollTargetLayout()
        }
        .scrollPosition(id: $scrolledPostID)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Top", systemImage: "arrow.up") {
                    withAnimation {
                        scrolledPostID = posts.first?.id
                    }
                }
            }
        }
    }
}
```

For content without a stable `ScrollView` + `id`-based anchor (e.g. a `List`), wrap in a `ScrollViewReader` and call `proxy.scrollTo(_:anchor:)` instead — `scrollPosition(id:)` is the modern replacement where the content already sits in a `ScrollView`/`LazyVStack` you control.

## `.scrollTransition()` for per-item effects

`.scrollTransition` applies a modifier phase (`.identity`, `.topLeading`/`.bottomTrailing` interpolated) as a view crosses into and out of the scroll viewport — no manual geometry reading required.

```swift
struct FadingCardListView: View {
    let cards: [FeatureCard]

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 20) {
                ForEach(cards) { card in
                    FeatureCardView(card: card)
                        .scrollTransition { content, phase in
                            content
                                .opacity(phase.isIdentity ? 1 : 0.3)
                                .scaleEffect(phase.isIdentity ? 1 : 0.85)
                                .blur(radius: phase.isIdentity ? 0 : 4)
                        }
                }
            }
        }
    }
}
```

`phase.value` ranges from `-1` (leading edge, about to appear) through `0` (fully visible / identity) to `1` (trailing edge, about to disappear), which is useful for continuous interpolation instead of a binary idle/transitioning switch:

```swift
.scrollTransition(axis: .horizontal) { content, phase in
    content.rotation3DEffect(
        .degrees(phase.value * 20),
        axis: (x: 0, y: 1, z: 0)
    )
}
```

## `.safeAreaPadding` vs `.padding`

`.padding()` applied to a `ScrollView`'s content shrinks the scrollable content area itself, which means content is inset even while scrolled to the very top/bottom — and it does not interact with the system safe area or a translucent bar's material.

`.safeAreaPadding()` extends the safe area inward without shrinking the scroll content's effective bounds the same way; content can still scroll edge-to-edge under a translucent toolbar while gaining breathing room from the actual safe-area-aware edge. Apply it to the `ScrollView` itself (not the inner stack) when you want list-like insets that respect the navigation bar / tab bar without clipping content behind them at rest:

```swift
ScrollView {
    LazyVStack(spacing: 12) {
        ForEach(posts) { PostRowView(post: $0) }
    }
}
.safeAreaPadding(.horizontal, 16)
```

Use `.padding()` on the inner stack when you want fixed visual insets regardless of safe area (e.g. a card list that should never touch the screen edge, safe area or not).

## `.contentMargins()`

`.contentMargins` insets the scrollable content independent of the container's own frame, and — unlike `.padding` on the stack — it also affects where paging/view-aligned snapping and the scroll indicators sit. Prefer it over `.padding` when the padding is a property of "how this scroll view presents its content" rather than a property of the content itself.

```swift
ScrollView(.horizontal) {
    LazyHStack(spacing: 12) {
        ForEach(items) { FeatureCardView(item: $0) }
    }
    .scrollTargetLayout()
}
.contentMargins(.horizontal, 20, for: .scrollContent)
.contentMargins(.vertical, 8, for: .scrollIndicators)
```

## `.scrollDisabled` and `.scrollClipDisabled()`

`.scrollDisabled(_:)` freezes user-driven scrolling (e.g. while an item is being dragged for reordering) while leaving programmatic `scrollPosition`/`ScrollViewReader` control intact:

```swift
ScrollView {
    ReorderableList(items: $items, isDragging: $isDragging)
}
.scrollDisabled(isDragging)
```

`.scrollClipDisabled()` opts a scroll view out of clipping its content to its own bounds — necessary when a child intentionally overflows (a card with a shadow or a badge that should render outside the visible scroll frame, or a horizontal carousel whose center item is scaled up beyond the container edge):

```swift
ScrollView(.horizontal) {
    LazyHStack {
        ForEach(items) { item in
            FeatureCardView(item: item)
                .shadow(radius: 12, y: 6)
        }
    }
}
.scrollClipDisabled()
```

Without it, shadows and any transform that pushes content past the scroll view's own frame get silently clipped at the edge.
