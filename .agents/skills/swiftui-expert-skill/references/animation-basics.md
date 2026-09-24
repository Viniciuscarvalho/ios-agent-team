# SwiftUI Animation Basics

## Implicit animation: `.animation(_:value:)`

Attaches an animation that fires whenever `value` changes and equals `Equatable`. Scope it to the smallest view that needs it — applying it high in the tree animates every downstream state change, including ones you didn't intend.

```swift
struct FavoriteButton: View {
    @State private var isFavorited = false

    var body: some View {
        Image(systemName: isFavorited ? "heart.fill" : "heart")
            .foregroundStyle(isFavorited ? .red : .secondary)
            .scaleEffect(isFavorited ? 1.2 : 1.0)
            .animation(.spring(duration: 0.3), value: isFavorited)
            .onTapGesture { isFavorited.toggle() }
    }
}
```

`value` is the trigger, not the animated quantity. Any animatable property that changes as a side effect of `isFavorited` flipping (scale, color, opacity) animates together, driven by the same curve.

Multiple `.animation(_:value:)` modifiers on the same view chain apply to different downstream properties independently:

```swift
Circle()
    .fill(color)
    .animation(.easeInOut(duration: 0.2), value: color)
    .frame(width: size, height: size)
    .animation(.bouncy, value: size)
```

Each modifier only affects properties applied *above* it in the modifier chain (visually, "before" it since SwiftUI applies modifiers outside-in from declaration order below). Keep the animation modifier immediately after the modifier whose property it should govern.

## Explicit animation: `withAnimation { }`

Wraps a state mutation so every resulting view update animates with the given `Animation`, without needing per-property `.animation` modifiers. Preferred when a single user action drives multiple, possibly unrelated, state changes.

```swift
struct ExpandableCard: View {
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading) {
            Text("Details")
            if isExpanded {
                Text("Extra content revealed on expand.")
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .onTapGesture {
            withAnimation(.easeInOut(duration: 0.25)) {
                isExpanded.toggle()
            }
        }
    }
}
```

`withAnimation` also accepts a completion handler (iOS 17+) fired when the animation finishes:

```swift
withAnimation(.spring(duration: 0.4)) {
    offset = .zero
} completion: {
    isSettled = true
}
```

Use `withAnimation(nil) { ... }` to force an immediate, unanimated state change inside a context where an ambient animation would otherwise apply (e.g. inside a parent already inside `withAnimation`).

## Animation curves

```swift
.animation(.linear, value: progress)
.animation(.linear(duration: 0.5), value: progress)
.animation(.easeInOut, value: progress)
.animation(.easeIn(duration: 0.3), value: progress)
.animation(.easeOut(duration: 0.3), value: progress)
```

### Springs — prefer the modern presets

`.spring()`, `.bouncy`, `.smooth`, and `.snappy` (iOS 17+) are all `Animation` values backed by the same spring model, differing only in default response/damping. Prefer these over legacy `.interactiveSpring`/`.spring(response:dampingFraction:blendDuration:)` for new code unless you need exact tuning.

```swift
.animation(.smooth, value: isOpen)          // damping ≈ 1.0, no overshoot
.animation(.snappy, value: isOpen)           // fast settle, slight overshoot
.animation(.bouncy, value: isOpen)           // pronounced overshoot, playful

.animation(.smooth(duration: 0.3, extraBounce: 0.1), value: isOpen)
.animation(.snappy(duration: 0.2, extraBounce: 0.0), value: isOpen)
.animation(.bouncy(duration: 0.5, extraBounce: 0.2), value: isOpen)
```

Duration/damping-fraction constructor when you need explicit physical parameters:

```swift
.animation(
    .spring(duration: 0.5, bounce: 0.3),
    value: isOpen
)

.animation(
    .spring(response: 0.55, dampingFraction: 0.825, blendDuration: 0),
    value: isOpen
)
```

- `duration` — time to settle within a small threshold of the target.
- `bounce` (0...1) — 0 is critically damped (no overshoot), higher values overshoot more.
- `dampingFraction` (legacy API) — 1.0 is critically damped; below 1.0 overshoots.
- `response` — how quickly the spring reacts to a change; lower is snappier.

Springs compose correctly with interruption: if `isOpen` toggles again mid-animation, SwiftUI blends the in-flight velocity into the new spring rather than restarting from zero, which is why springs read as more natural than `.easeInOut` for interruptible, gesture-driven UI.

## Animating specific properties vs. whole-view animation

`.animation(_:value:)` placed on a leaf view only animates that view's own animatable properties. To animate a whole subtree (e.g. every child's layout shifting together when a parent's state changes), apply the modifier further up, or wrap the state mutation in `withAnimation` so every affected view animates coherently regardless of where in the tree it lives.

```swift
// Only the icon's rotation animates; sibling text jumps instantly.
HStack {
    Image(systemName: "chevron.right")
        .rotationEffect(.degrees(isExpanded ? 90 : 0))
        .animation(.easeInOut, value: isExpanded)
    Text(title)
}

// Both icon rotation and any layout-driven text reflow animate together.
HStack {
    Image(systemName: "chevron.right")
        .rotationEffect(.degrees(isExpanded ? 90 : 0))
    Text(title)
}
.animation(.easeInOut, value: isExpanded)
```

## `Animation` value equality drives re-trigger

`.animation(_:value:)` re-runs the animation only when `value` actually changes per `Equatable`. Passing a computed value that happens to equal the previous one (e.g. clamped to the same bound twice) will *not* animate, which is correct — but it also means animating a `struct` requires it to conform to `Equatable` with semantically meaningful equality, not just reference identity.

```swift
struct CardLayout: Equatable {
    var width: CGFloat
    var height: CGFloat
}

@State private var layout = CardLayout(width: 100, height: 100)

// ...
.animation(.spring(duration: 0.3), value: layout)
```

## Disabling animations

Use `.transaction` to strip animation from a specific subtree or a specific state change, without affecting sibling animations:

```swift
Toggle("Notifications", isOn: $isEnabled)
    .transaction { transaction in
        transaction.disablesAnimations = true
    }
```

To suppress animation for one particular mutation regardless of ambient `withAnimation` context:

```swift
withAnimation(.default) {
    scale = 1.0
    withTransaction(\.disablesAnimations, true) {
        isHighlighted = false
    }
}
```

`UIView.setAnimationsEnabled(false)`-style global disabling has no SwiftUI equivalent and shouldn't be needed — always scope via `.transaction`.

## Common pitfalls

**Animating layout-affecting properties causes jank.** Animating `.frame`, `.padding`, or conditional view insertion/removal forces SwiftUI to recompute layout every frame, which is far more expensive than animating a `GeometryEffect`-backed property like `.scaleEffect`, `.offset`, or `.rotationEffect`. Prefer animating render-only transforms:

```swift
// Expensive: triggers layout pass each frame.
.frame(width: isExpanded ? 200 : 100)

// Cheap: GPU-composited transform, no layout recalculation.
.scaleEffect(x: isExpanded ? 2.0 : 1.0, anchor: .leading)
```

When you must animate a layout property (e.g. resizing a card to fit new content), keep the animated subtree small and isolated so the layout pass doesn't cascade to unrelated siblings.

**Animating inside `ForEach` without stable identity breaks insertion/removal animations.** If `id` is derived from array index rather than a stable identifier, SwiftUI can't tell that an element moved vs. was replaced, so it will crossfade/jump instead of natural insert/remove/reorder:

```swift
// Wrong: index-based identity — reordering looks like replacement.
ForEach(Array(items.enumerated()), id: \.offset) { _, item in
    RowView(item: item)
}

// Right: stable identity — SwiftUI tracks each row across reorders.
ForEach(items) { item in   // Identifiable, or ForEach(items, id: \.stableID)
    RowView(item: item)
}
.animation(.default, value: items)
```

Without stable identity, `.transition()` and implicit animations on `ForEach` content can't distinguish "this row moved" from "this row was removed and a different row was inserted at the same slot," producing visually incorrect crossfades instead of clean reordering.
