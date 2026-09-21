# Liquid Glass (iOS 26 / macOS 26 / iPadOS 26 / watchOS 26 / tvOS 26)

Liquid Glass is the dynamic material introduced at WWDC 2025 that forms the topmost functional layer for controls and navigation (toolbars, tab bars, sidebars, sheets, popovers, controls). It blurs and refracts content behind it, reflects surrounding color and light, and reacts to touch/pointer input in real time. All APIs below require the `iOS 26.0+` / `macOS 26.0+` (etc.) SDKs; recompiling with Xcode 26 alone upgrades standard SwiftUI/UIKit/AppKit components automatically — custom views need explicit adoption via the APIs in this document.

## `Glass` and `.glassEffect(_:in:)`

`Glass` is the configuration structure you pass to the `glassEffect(_:in:)` view modifier. It conforms to `Equatable, Sendable`.

```swift
struct Glass: Equatable, Sendable {
    static var regular: Glass { get }
    static var identity: Glass { get }   // renders as if no glass effect were applied
    static var clear: Glass { get }

    func tint(_ color: Color?) -> Glass
    func interactive(_ isEnabled: Bool = true) -> Glass
}

nonisolated func glassEffect<S: Shape>(_ glass: Glass = .regular, in shape: S = .capsule) -> some View
```

Default shape is `Capsule`; default variant is `.regular`. Apply `glassEffect(_:in:)` **after** modifiers that affect the view's appearance (padding, font, foregroundStyle) — it captures the view's rendered content to hand off to the glass renderer.

```swift
Text("Hello, World!")
    .font(.title)
    .padding()
    .glassEffect()

Text("Hello, World!")
    .font(.title)
    .padding()
    .glassEffect(in: .rect(cornerRadius: 16.0))

Text("Hello, World!")
    .font(.title)
    .padding()
    .glassEffect(.regular.tint(.orange).interactive())
```

`.interactive()` opts a custom view into the same fluid highlight/press response that `PrimitiveButtonStyle.glass` gives standard buttons — use it only on views that respond to touch or pointer input, never on static decoration.

## `GlassEffectContainer`

Combining more than one glass view **must** happen inside a `GlassEffectContainer`. Outside a container, every `glassEffect()` view renders its own independent backdrop pass, which is expensive and prevents shapes from blending or morphing into each other.

```swift
@MainActor @preconcurrency struct GlassEffectContainer<Content: View>: View {
    init(spacing: CGFloat = /* system default */, @ViewBuilder content: () -> Content)
}
```

`spacing` controls how close two glass shapes must be before their backdrops start blending. It is independent of (and typically larger than) the layout spacing of an interior `HStack`/`VStack` — a container spacing larger than the stack's own spacing causes shapes to visually merge at rest.

```swift
GlassEffectContainer(spacing: 40.0) {
    HStack(spacing: 40.0) {
        Image(systemName: "scribble.variable")
            .frame(width: 80.0, height: 80.0)
            .font(.system(size: 36))
            .glassEffect()

        Image(systemName: "eraser.fill")
            .frame(width: 80.0, height: 80.0)
            .font(.system(size: 36))
            .glassEffect()
            .offset(x: -40.0, y: 0.0)
    }
}
```

### Forcing a shared shape with `glassEffectUnion(id:namespace:)`

When views live outside a single layout container (or are generated dynamically), use `glassEffectUnion(id:namespace:)` to force all views sharing an `id` to render as one merged capsule, regardless of rest-state geometry:

```swift
@Namespace private var namespace
let symbolSet = ["cloud.bolt.rain.fill", "sun.rain.fill", "moon.stars.fill", "moon.fill"]

GlassEffectContainer(spacing: 20.0) {
    HStack(spacing: 20.0) {
        ForEach(symbolSet.indices, id: \.self) { index in
            Image(systemName: symbolSet[index])
                .frame(width: 80.0, height: 80.0)
                .font(.system(size: 36))
                .glassEffect()
                .glassEffectUnion(id: index < 2 ? "1" : "2", namespace: namespace)
        }
    }
}
```

## Morphing transitions: `glassEffectID(_:in:)`

To make one glass shape morph into another during an animated hierarchy change (rather than crossfade), give both views a stable ID from the same `Namespace` inside a shared `GlassEffectContainer`:

```swift
@State private var isExpanded = false
@Namespace private var namespace

var body: some View {
    GlassEffectContainer(spacing: 40.0) {
        HStack(spacing: 40.0) {
            Image(systemName: "scribble.variable")
                .frame(width: 80.0, height: 80.0)
                .glassEffect()
                .glassEffectID("pencil", in: namespace)

            if isExpanded {
                Image(systemName: "eraser.fill")
                    .frame(width: 80.0, height: 80.0)
                    .glassEffect()
                    .glassEffectID("eraser", in: namespace)
            }
        }
    }

    Button("Toggle") {
        withAnimation { isExpanded.toggle() }
    }
    .buttonStyle(.glass)
}
```

`GlassEffectTransition` controls the animation style when a glass view is added/removed within a container:

- `.matchedGeometry` (default) — used when the appearing/disappearing shape is within the container's `spacing` of a sibling; produces the morph.
- `.materialize` — a simpler fade/scale-in transition for shapes farther apart than `spacing`; pair with `withAnimation(_:_:)`.

Use `matchedGeometry` and `materialize` consistently across an app rather than inventing custom opacity-only transitions — the system transition types animate more than opacity (blur radius, specular highlight, shape) and mixing custom transitions in will look inconsistent next to system chrome.

## Button styles: `.glass` and `.glassProminent`

Prefer these over hand-rolled `glassEffect()` buttons whenever a standard `Button` fits — they pick up the system's built-in border artwork and context-aware sizing for free.

```swift
Button("Cancel", action: cancel)
    .buttonStyle(.glass)

Button("Save", action: save)
    .buttonStyle(.glassProminent)
    .tint(.blue)
```

- `.glass` (`GlassButtonStyle`) — translucent glass, for secondary/common actions.
- `.glassProminent` (`GlassProminentButtonStyle`) — opaque, tinted prominent glass, for the single primary action in a group. Don't apply `.glassProminent` to more than one button in the same visual group — it defeats the purpose of "prominent."

## What adopts Liquid Glass automatically vs. what needs opt-in

**Automatic** (standard SwiftUI/UIKit/AppKit components, on rebuild with Xcode 26 SDK, no code changes):
- `NavigationStack`/`NavigationSplitView` toolbars, tab bars, sidebars, inspectors
- `.sheet`, `.popover`, action sheets, alerts
- Standard controls: `Button`, `Toggle`, `Slider`, `Menu`, pickers
- Menu bar and menu items (macOS/iPadOS)

**Requires explicit opt-in:**
- Any custom view you want to render as glass — apply `glassEffect(_:in:)`.
- Interactive touch/pointer response on a custom view — `.interactive()`.
- Toolbar item grouping/separation beyond automatic grouping — `ToolbarSpacer(_:placement:)` inserts a visual break between two groups of toolbar items that would otherwise share one glass background:

```swift
ToolbarItemGroup {
    Button("Cut", systemImage: "scissors", action: cut)
    Button("Copy", systemImage: "doc.on.doc", action: copy)
    ToolbarSpacer(.fixed)
    Button("Delete", systemImage: "trash", action: delete)
}
```

- Scroll-edge legibility for **custom** bars (system bars like toolbars get this by default): `scrollEdgeEffectStyle(_:for:)`.

```swift
ScrollView {
    content
}
.scrollEdgeEffectStyle(.soft, for: .top)
```

- Stretching content under a sidebar/inspector without actually scrolling content underneath it: `backgroundExtensionEffect()`.

```swift
heroImage
    .backgroundExtensionEffect()
```

- Tab bar minimize-on-scroll behavior: `tabBarMinimizeBehavior(_:)`.

```swift
TabView { /* ... */ }
    .tabBarMinimizeBehavior(.onScrollDown)
```

- Marking a tab as the dedicated search tab (search field replaces the tab bar): `Tab(role: .search) { ... }`, tuned per-placement via `TabViewBottomAccessoryPlacement`.

```swift
TabView {
    Tab("Search", systemImage: "magnifyingglass", role: .search) {
        SearchResultsView()
    }
}
```

## Tinting and interactivity

Tint conveys semantic prominence (destructive, primary, brand color) — apply sparingly, and always via `Glass.tint(_:)` or the standard `.tint(_:)` modifier rather than a custom-colored background behind the glass, so the material still refracts correctly.

```swift
Text("3 new messages")
    .padding()
    .glassEffect(.regular.tint(.red).interactive())
```

Only mark a glass view `.interactive()` if it responds to a tap/press/hover — non-interactive decorative glass should stay at the default (non-interactive) configuration to avoid implying affordance that isn't there.

## Accessibility

Liquid Glass adapts automatically to accessibility settings **when you use standard components or the documented APIs** — you generally do not need to branch your own code:

- **Reduce Transparency** (`Settings > Accessibility > Display & Text Size`): the system increases glass opacity and reduces the lensing/refraction effect for legibility. Read it via `@Environment(\.accessibilityReduceTransparency)` only if you're building a fully custom (non-`glassEffect`) translucent surface that needs the same fallback:

```swift
@Environment(\.accessibilityReduceTransparency) private var reduceTransparency

var body: some View {
    content
        .glassEffect(reduceTransparency ? .identity : .regular)
}
```

- **Increase Contrast**: the system strengthens glass border artwork and separates overlapping glass shapes more distinctly; no code required for standard components.
- **Reduce Motion**: morphing transitions (`matchedGeometry`) degrade to simpler fades; custom animations you build around `glassEffectID` should also branch on `@Environment(\.accessibilityReduceMotion)` if you added extra motion (parallax, spring overshoot) beyond what `withAnimation` + the system transition already provides.

**Always** provide an accessibility label for icon-only toolbar/menu items regardless of glass adoption — VoiceOver and Voice Control users depend on it independent of the material.

## When to use glass vs. a plain material

Use `glassEffect` for the **navigational and control layer** — toolbars, floating action buttons, custom tab bars, badges/HUDs that sit above content and need to feel like part of the system chrome. Use plain SwiftUI materials (`.thinMaterial`, `.regularMaterial`, `.ultraThinMaterial` via `.background(.regularMaterial)`) for **in-content** surfaces — card backgrounds, grouped list backgrounds — where you want a translucent look without the glass layer's lensing, specular highlight, and morph behavior, or where the view isn't part of the app's fixed navigation/control layer.

Do not stack multiple independent `glassEffect()` containers in the same screen region — apply Liquid Glass to the most important functional elements only. Overuse competes with the content Liquid Glass is designed to bring focus to, and each extra `GlassEffectContainer` adds its own backdrop render pass, which measurably affects scroll performance on lower-end devices. Combine sibling glass views into one container instead of nesting separate containers.

## Performance checklist

- Minimize the number of `GlassEffectContainer`s on screen simultaneously.
- Never apply `glassEffect()` to a view outside any container if there's more than one glass view in that screen region — combine them.
- Apply `glassEffect(_:in:)` as the last modifier in the chain so it captures the final rendered appearance rather than re-deriving it.
- Profile with Instruments' Core Animation and Hangs templates after adopting custom glass — see WWDC 2025's "Meet Liquid Glass performance" talk for the counters to watch (composited layer count, offscreen render passes).
