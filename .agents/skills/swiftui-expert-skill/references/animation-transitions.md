# SwiftUI Transitions & Content Changes

## `.transition()` modifier

Governs how a view animates when it enters/leaves the view hierarchy (conditional inclusion, `if`/`else`, `ForEach` add/remove). Only takes effect when the insertion/removal itself is wrapped in an animation — either an enclosing `.animation(_:value:)` on the condition, or `withAnimation`.

```swift
struct BannerView: View {
    @State private var isShowing = false

    var body: some View {
        VStack {
            Button("Toggle") {
                withAnimation(.easeInOut(duration: 0.3)) {
                    isShowing.toggle()
                }
            }
            if isShowing {
                Text("Saved successfully")
                    .transition(.opacity)
            }
        }
    }
}
```

Without the surrounding animation, the view simply appears/disappears instantly regardless of `.transition`.

## Built-in transitions

```swift
.transition(.opacity)
.transition(.slide)                       // move + fade, edge-aware
.transition(.move(edge: .trailing))
.transition(.scale)                        // scale(scale: 0, anchor: .center)
.transition(.scale(scale: 0.8, anchor: .top))
.transition(.offset(x: 0, y: 40))
.transition(.identity)                     // no animation of appearance itself
```

`.move` and `.slide` animate an actual layout offset, so like any layout-affecting property they're more expensive than `.opacity`/`.scale`, which SwiftUI composites without a layout pass.

## Combining transitions with `.combined(with:)`

```swift
.transition(.opacity.combined(with: .scale(scale: 0.9)))
```

`.combined(with:)` applies both transitions symmetrically for insertion and removal. For different insertion vs. removal behavior use `.asymmetric`:

```swift
.transition(
    .asymmetric(
        insertion: .move(edge: .bottom).combined(with: .opacity),
        removal: .opacity
    )
)
```

Asymmetric transitions are the standard pattern for toast/snackbar UI: slide up + fade in on insertion, plain fade on removal (so removal doesn't look like it's sliding back offscreen while other content reflows).

## Custom `Transition` protocol (iOS 17+)

The modern, composable replacement for `AnyTransition`-based custom transitions. Conform to `Transition`, implement `body(content:phase:)`, and switch on `TransitionPhase` (`.willAppear`, `.identity`, `.didDisappear`).

```swift
struct PivotTransition: Transition {
    func body(content: Content, phase: TransitionPhase) -> some View {
        content
            .rotation3DEffect(
                .degrees(phase.isIdentity ? 0 : 90),
                axis: (x: 0, y: 1, z: 0),
                anchor: .leading,
                perspective: 0.5
            )
            .opacity(phase.isIdentity ? 1 : 0)
    }
}

extension AnyTransition {
    static var pivot: AnyTransition { .init(PivotTransition()) }
}
```

Usage is identical to built-in transitions:

```swift
if showsDetail {
    DetailPanel()
        .transition(PivotTransition())
}
```

`TransitionPhase` has three cases: `.willAppear` (just before insertion animates in), `.identity` (steady state, view fully present), `.didDisappear` (just after removal animation, before the view is actually removed). `phase.isIdentity` is a convenience for `phase == .identity`. This protocol lets you drive *any* animatable modifier — 3D rotation, blur, custom shader — as a transition, not just the built-in geometry/opacity primitives.

A transition that also needs to react to reduced-motion should read the environment inside `body`:

```swift
struct PivotTransition: Transition {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content, phase: TransitionPhase) -> some View {
        if reduceMotion {
            content.opacity(phase.isIdentity ? 1 : 0)
        } else {
            content
                .rotation3DEffect(
                    .degrees(phase.isIdentity ? 0 : 90),
                    axis: (x: 0, y: 1, z: 0),
                    anchor: .leading,
                    perspective: 0.5
                )
                .opacity(phase.isIdentity ? 1 : 0)
        }
    }
}
```

## `matchedGeometryEffect` for shared-element transitions

Ties two views' frames together across a namespace so one visually morphs into the other's position/size when a shared boolean flips, typically inside `withAnimation`.

```swift
struct GalleryView: View {
    @Namespace private var namespace
    @State private var selectedItem: GalleryItem?

    var body: some View {
        ZStack {
            if let selectedItem {
                DetailView(item: selectedItem)
                    .matchedGeometryEffect(id: selectedItem.id, in: namespace)
                    .onTapGesture {
                        withAnimation(.spring(duration: 0.35)) {
                            self.selectedItem = nil
                        }
                    }
            } else {
                ScrollView {
                    LazyVGrid(columns: [GridItem(), GridItem()]) {
                        ForEach(items) { item in
                            ThumbnailView(item: item)
                                .matchedGeometryEffect(id: item.id, in: namespace)
                                .onTapGesture {
                                    withAnimation(.spring(duration: 0.35)) {
                                        selectedItem = item
                                    }
                                }
                        }
                    }
                }
            }
        }
    }
}
```

Both the source and destination views must be present in the hierarchy (even if one is about to be removed) at the moment the animation starts for the geometry match to interpolate correctly — this is why the pattern is usually built with a single `ZStack` swap rather than a `NavigationLink` push, where the source view is gone before the destination appears.

## `NavigationTransition` / zoom transitions

iOS 18+ provides `.navigationTransition(.zoom(sourceID:in:))` to get a native zoom-morph between a list thumbnail and a pushed detail view, without manually wiring `matchedGeometryEffect`:

```swift
struct ThumbnailGridView: View {
    @Namespace private var namespace

    var body: some View {
        NavigationStack {
            LazyVGrid(columns: [GridItem(), GridItem()]) {
                ForEach(items) { item in
                    NavigationLink(value: item) {
                        ThumbnailView(item: item)
                    }
                    .matchedTransitionSource(id: item.id, in: namespace)
                }
            }
            .navigationDestination(for: GalleryItem.self) { item in
                DetailView(item: item)
                    .navigationTransition(.zoom(sourceID: item.id, in: namespace))
            }
        }
    }
}
```

Prefer this over hand-rolled `matchedGeometryEffect` for push navigation specifically — it correctly handles interactive swipe-back and safe-area/toolbar transitions that a manual geometry match doesn't account for.

## `ContentTransition` for text/symbol content changes

`ContentTransition` governs how a `Text` or `Image(systemName:)`'s *content* (not presence) morphs when its value changes in place, distinct from `.transition()` which only applies to insertion/removal.

```swift
Text(scoreText)
    .contentTransition(.numericText(value: Double(score)))
    .animation(.snappy, value: score)
```

`.numericText(value:)` animates digit-by-digit rolling when the underlying number changes — pass the numeric `value` so SwiftUI knows whether digits are counting up or down for correct roll direction. Omit `value:` for a generic numeric crossfade when you don't have a comparable `Double`.

```swift
Image(systemName: isPlaying ? "pause.fill" : "play.fill")
    .contentTransition(.symbolEffect(.replace))
    .animation(.default, value: isPlaying)

Text(status)
    .contentTransition(.interpolate)   // generic shape interpolation for custom fonts/glyphs
```

`.symbolEffect(.replace)` on `contentTransition` produces SF Symbols' native draw-in/draw-out morph between two distinct symbols (e.g. play ↔ pause) instead of a plain crossfade — it only works correctly between symbols designed with compatible layer structure, which is true for most system symbol pairs like play/pause, but should be visually verified for exotic pairs.
