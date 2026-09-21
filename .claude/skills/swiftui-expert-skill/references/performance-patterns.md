# SwiftUI Performance Patterns

Reference for understanding SwiftUI's render pipeline and avoiding common causes of dropped frames and excessive work. Pairs with Instruments' SwiftUI template for verification.

## The diffing/re-render model

SwiftUI does not re-render the whole screen on every state change. The pipeline is:

1. A dependency a view's `body` read (a `@State`, an `@Observable` property, an `@Environment` value, a `Binding`) changes.
2. SwiftUI marks that view's identity as needing a body re-evaluation.
3. `body` is called again, producing a new view value tree.
4. SwiftUI diffs the new tree against the previous one, structurally, by view identity (explicit `.id()`, or structural position for value types) — not by re-rendering every pixel.
5. Only the subtrees whose inputs actually changed get their underlying platform representations (UIView/NSView-backed or Core Animation layers) updated.

The unit of invalidation is the **view value type**, not the file or the developer's mental grouping. This is why extracting a real `struct: View` (not a computed property, see `view-structure.md`) is the primary lever for narrowing re-render scope — each extracted view is independently diffed and can be skipped entirely if its own inputs didn't change.

## `@Observable` fine-grained invalidation vs. `ObservableObject`

This is the single biggest performance-relevant difference between the modern and legacy observation models.

With `ObservableObject`, every `@Published` property funnels through the same `objectWillChange` publisher. Any view observing the object via `@ObservedObject`/`@StateObject` re-evaluates `body` on *any* published mutation, whether or not that view actually reads the changed property.

```swift
final class LegacyCartModel: ObservableObject {
    @Published var items: [CartItem] = []
    @Published var isCheckingOut = false
}

struct ItemCountBadge: View {
    @ObservedObject var cart: LegacyCartModel
    var body: some View {
        Text("\(cart.items.count)") // re-renders even when only isCheckingOut changes
    }
}
```

With `@Observable`, the framework instruments property *access*, not the type. A view re-renders only if a property it actually read during the last `body` execution changed value.

```swift
@Observable
final class CartModel {
    var items: [CartItem] = []
    var isCheckingOut = false
}

struct ItemCountBadge: View {
    let cart: CartModel
    var body: some View {
        Text("\(cart.items.count)") // unaffected by isCheckingOut changes
    }
}
```

Practical implication: prefer many small `@Observable` types (or one type with many properties, which is fine under `@Observable`) over manually splitting objects just to limit invalidation scope — the property-level tracking already does that job. Splitting types is still worthwhile for separation of concerns, not required for performance the way it was with `ObservableObject`.

## Avoiding unnecessary body recomputation

**Extract stable subviews.** A subview that doesn't read the state that changed is skipped entirely during diffing, provided it's a real `View` type receiving only the specific values it needs — not the whole parent's observable object if it only uses one field of it (reading it via a plain property still tracks only what's accessed, but passing narrower, value-type inputs makes the dependency explicit and easier to reason about).

**Use `Equatable` conformance with `.equatable()` for expensive views.** By default SwiftUI re-diffs a subview's body whenever its parent's body runs, even if the subview's own inputs are unchanged value-for-value, because it doesn't know how to cheaply compare arbitrary view values. `.equatable()` tells SwiftUI to skip re-invoking `body` if the view value itself compares equal to the previous one:

```swift
struct HeavyChartView: View, Equatable {
    let dataPoints: [DataPoint]

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.dataPoints == rhs.dataPoints
    }

    var body: some View {
        Canvas { context, size in
            // expensive drawing driven by dataPoints
        }
    }
}

// Usage:
HeavyChartView(dataPoints: dataPoints)
    .equatable()
```

Reserve this for views with a genuinely expensive `body` (custom `Canvas`/`Core Animation` drawing, large computed layouts) — for cheap views the equality check itself costs more than just re-running `body`.

## `ForEach` identity: `id()` vs. stable identity

`ForEach` needs a stable identity per element to diff insertions/removals/moves correctly. Three ways to supply it, in order of preference:

```swift
// Best: Identifiable with a durable identifier
struct Order: Identifiable {
    let id: UUID
    var status: OrderStatus
}
ForEach(orders) { order in
    OrderRow(order: order)
}

// Fine: explicit id keypath when the type isn't Identifiable
ForEach(orders, id: \.serverIdentifier) { order in
    OrderRow(order: order)
}

// Dangerous: relying on array index as identity
ForEach(Array(orders.enumerated()), id: \.offset) { _, order in
    OrderRow(order: order)
}
```

Index-based identity is dangerous because the index is not the element's identity — it's a position. When an element is inserted, removed, or reordered, every element after the mutation point gets a "new" identity assigned to old data (or vice versa), causing SwiftUI to treat unrelated elements as the same view, misapplying animations, losing `@State` that was implicitly tied to that identity (e.g., text field focus, disclosure state), and doing more diffing work than necessary. Always identify by a durable, content-independent key (server ID, UUID) — never by position, and never by a value that can collide (e.g., a display name).

`.id()` as a view modifier is different: it forces SwiftUI to treat a view as an entirely new identity when the id value changes, which *discards and recreates* the view's state. Use it deliberately to reset state (e.g., resetting a form when navigating between records), not as a substitute for `ForEach`'s identity parameter:

```swift
DetailForm(record: record)
    .id(record.id) // fully resets DetailForm's @State when record.id changes
```

## Avoiding heavy work in `body`

`body` can be called many times per second during animations, scrolling, and gesture tracking. It must be cheap and side-effect-free.

```swift
// Wrong: parses/formats on every body evaluation
var body: some View {
    Text(expensiveDateFormatter.string(from: order.date))
}

// Right: precompute once when the underlying data changes, or use a lightweight formatter
var body: some View {
    Text(order.date, format: .dateTime.month().day().year())
}
```

Avoid network calls, disk I/O, JSON decoding, or non-trivial sorting/filtering directly inside `body`. Compute derived values in the model/view model layer (or a `.task`, see below), and have `body` just read the already-computed result.

## `.task` vs. `.onAppear` for async work

`.onAppear` is a synchronous callback with no structured lifetime — if you kick off an unstructured `Task` inside it, you're responsible for manually cancelling it in `.onDisappear`, and it's easy to forget.

```swift
// Avoid: manual task lifecycle management, easy to leak
struct ProductDetailView: View {
    let productID: Product.ID
    @State private var task: Task<Void, Never>?

    var body: some View {
        ContentView()
            .onAppear {
                task = Task { await loadProduct() }
            }
            .onDisappear {
                task?.cancel()
            }
    }
}
```

`.task` attaches a structured `Task` to the view's lifetime automatically — it starts when the view appears and is cancelled automatically when the view disappears, with no manual bookkeeping:

```swift
struct ProductDetailView: View {
    let productID: Product.ID
    @State private var product: Product?

    var body: some View {
        ContentView(product: product)
            .task(id: productID) {
                product = try? await ProductService.shared.fetch(id: productID)
            }
    }
}
```

The `id:` parameter re-runs the task (cancelling any in-flight one) whenever the id value changes — essential when the view is reused for different underlying data (e.g., a detail view whose `productID` changes via navigation) instead of being torn down and recreated.

## `drawingGroup()` for Core-Animation-backed rendering

`.drawingGroup()` composites a subtree into a single Core Animation-backed layer (via Metal), which helps when a view has many overlapping semi-transparent layers, gradients, blurs, or shadows that would otherwise each be a separate composited layer:

```swift
ZStack {
    ForEach(particles) { particle in
        Circle()
            .fill(particle.color)
            .opacity(particle.opacity)
            .blur(radius: particle.blurRadius)
            .offset(particle.offset)
    }
}
.drawingGroup()
```

Costs: the subtree is rasterized offscreen and re-rendered as a texture, which adds a compositing pass and disables some interactive/accessibility behaviors that rely on individual layer identity (e.g., hit testing quirks, some animations). Measure with Instruments before and after — `drawingGroup()` helps GPU-bound compositing scenarios (many layered effects) and can *hurt* simple content by forcing unnecessary offscreen rendering.

## Lazy stacks/grids for large content

`VStack`/`HStack` instantiate and lay out every child eagerly, even off-screen ones — fine for a fixed handful of items, catastrophic for a long list. `LazyVStack`/`LazyHStack` and `LazyVGrid`/`LazyHGrid` only materialize children near the visible viewport:

```swift
ScrollView {
    LazyVStack(spacing: 8) {
        ForEach(transactions) { transaction in
            TransactionRow(transaction: transaction)
        }
    }
}
```

For content whose count can exceed roughly a screenful, always reach for the lazy variant (or `List`, which is lazy by default — see `list-patterns.md`) rather than a plain stack.

## Avoiding `GeometryReader` overuse

`GeometryReader` reports the size/position offered by its parent, but it does so by becoming **greedy**: it accepts all the space its parent offers, regardless of what its content actually needs, and forces an additional layout pass to resolve its children's frames against the reported geometry.

```swift
// Overuse: GeometryReader for something layout primitives already solve
struct HalfWidthImage: View {
    var body: some View {
        GeometryReader { proxy in
            Image("banner")
                .resizable()
                .frame(width: proxy.size.width / 2)
        }
    }
}

// Prefer: containerRelativeFrame or plain modifiers
struct HalfWidthImage: View {
    var body: some View {
        Image("banner")
            .resizable()
            .containerRelativeFrame(.horizontal) { width, _ in width / 2 }
    }
}
```

Reach for `GeometryReader` only when you genuinely need the resolved size/coordinate space of an ancestor for computation (e.g., custom drag gestures, parallax effects) — not as a default way to read "how wide is this". Nesting multiple `GeometryReader`s compounds both the greedy-sizing problem and the extra layout passes, and is a frequent cause of layout thrashing in Instruments traces.

## Profiling guidance

Confirm suspected performance issues in Instruments before optimizing — the SwiftUI template surfaces:

- **View body counts** — how many times each view's `body` was evaluated per interaction; spot views re-rendering far more often than their visible state changes.
- **Long view body durations** — flags expensive work happening inside `body` (see "heavy work in body" above).
- **Update reasons** — which dependency (state, environment, binding) triggered a given re-render, useful for tracking down over-scoped `@State` or `@Observable` reads that are broader than necessary.

Cross-reference with the Hangs and Time Profiler templates for anything blocking the main thread, and Core Animation for compositing/offscreen-render costs (particularly around `drawingGroup()`, shadows, and blurs). Treat Instruments output as the source of truth — reason about `@Observable` invalidation scope and extraction boundaries above as *hypotheses* to verify, not conclusions to apply blindly.
