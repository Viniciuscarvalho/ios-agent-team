---
name: swiftui-expert-skill
description: Modern SwiftUI expertise for building, reviewing, and refactoring views — state management, navigation, performance, animation, accessibility, Swift Charts, Liquid Glass, and macOS SwiftUI apps.
---

# SwiftUI Expert

Reference material for writing and reviewing SwiftUI code against the current iOS 26 / macOS 26 SDKs. Default to `@Observable` over `ObservableObject`, prefer value types and unidirectional data flow, and adopt Liquid Glass deliberately rather than by accident. Each section below is a summary — consult the matching file in `references/` for full guidance and code examples before making non-trivial decisions.

## State management

Own state at the lowest scope that needs it. Use `@State` for local value-type state, `@Binding` to pass a two-way reference down, `@Observable` (not `ObservableObject`/`@Published`) for reference-type model objects, and `@Bindable` when a view needs two-way bindings into an `@Observable` object it doesn't own. `@Observable` invalidates only the views that actually read a changed property — coarse `ObservableObject` invalidation is legacy behavior, not the default to reach for. Use `@Environment` for dependency injection (custom `EnvironmentKey` or an `@Observable` instance), `@AppStorage`/`@SceneStorage` for persisted UI state. Never duplicate a single source of truth across two properties. See `references/state-management.md`.

## View structure

Prefer many small, focused views over one large `body`. Extract a subview when it stabilizes identity or clarifies intent — not just to shorten a function; a computed property returning `some View` doesn't reduce diffing cost the way an actual subview does. Never use `AnyView` to paper over a type mismatch — restructure with `@ViewBuilder` or a generic instead. Reusable styling belongs in a `ViewModifier`, not copy-pasted modifier chains. See `references/view-structure.md`.

## Performance

SwiftUI re-invokes `body` on any input change to a view's identity; the cost is in how much work `body` does, not the invocation itself. Keep `body` cheap, hoist expensive computation out, use `.equatable()` on views with costly-to-diff content, prefer `LazyVStack`/`LazyVGrid`/`List` for large collections, and avoid `GeometryReader` unless you truly need the proposed size — it forces greedy sizing and adds a layout pass. Use `.task` (not `.onAppear`) for cancellable async work tied to a view's lifetime. Profile with Instruments' SwiftUI template before guessing. See `references/performance-patterns.md` and `references/list-patterns.md`.

## Navigation and presentation

Use `NavigationStack` with type-safe `navigationDestination(for:)` and a `NavigationPath` for programmatic and deep-link navigation; `NavigationSplitView` for sidebar-driven multi-column layouts. Model navigation state as an `@Observable` router/coordinator rather than scattering `@State` booleans across views. Prefer `.sheet(item:)` over `.sheet(isPresented:)` so presented content has identity. Use `.presentationDetents` for partial-height sheets and `@Environment(\.dismiss)` for programmatic dismissal. See `references/sheet-navigation-patterns.md`.

## Layout and scrolling

Remember the layout algorithm: parent proposes a size, child chooses its own size within that proposal, parent places it. Use `Grid`/`GridRow` instead of nested `HStack`/`VStack` for tabular layouts, `ViewThatFits` for adaptive switching, and the `Layout` protocol when you need a genuinely custom container. For scrolling, reach for `.scrollTargetBehavior`, `.scrollPosition(id:)`, and `.scrollTransition` before hand-rolling offset tracking with `GeometryReader`. See `references/layout-best-practices.md` and `references/scroll-patterns.md`.

## Animation

Use `withAnimation` for explicit, user-triggered animation and `.animation(_:value:)` for implicit animation tied to a specific value. Prefer the modern spring presets (`.smooth`, `.snappy`, `.bouncy`) over hand-tuned curves unless you have a specific reason. Reach for `PhaseAnimator` for multi-step sequences and `KeyframeAnimator` for multi-track fine control rather than chaining `DispatchQueue.asyncAfter` animation blocks. Use the `Transition` protocol for custom insertion/removal effects and `matchedGeometryEffect` (or `.navigationTransition(.zoom)`) for shared-element transitions. See `references/animation-basics.md`, `references/animation-transitions.md`, `references/animation-advanced.md`.

## Accessibility

Every custom control needs a correct `.accessibilityLabel`/`.accessibilityValue`/`.accessibilityHint`, and every compound view needs a deliberate `.accessibilityElement(children:)` choice so VoiceOver doesn't stop on every subview. Respect `@Environment(\.accessibilityReduceMotion)` in custom animations and `@Environment(\.accessibilityReduceTransparency)` around Liquid Glass and materials — don't assume the default motion/transparency is always acceptable. Support Dynamic Type by avoiding fixed-height frames around text. Verify with VoiceOver and the Accessibility Inspector, not just by reading the modifiers. See `references/accessibility-patterns.md`.

## Swift Charts

Build charts by composing marks (`BarMark`, `LineMark`, `PointMark`, `AreaMark`, `RuleMark`, `SectorMark`) inside a single `Chart`, not by hand-drawing shapes. Use `chartXSelection`/`chartYSelection` for interactive selection and `chartScrollableAxes` for scrollable time series. Charts are not accessible by default — provide an `AXChartDescriptor` via `.accessibilityChartDescriptor` so VoiceOver and the audio graph can navigate the underlying data, not just read a flat image description. See `references/charts.md` and `references/charts-accessibility.md`.

## Liquid Glass (iOS 26 / macOS 26)

Liquid Glass is the current system material — many standard controls (tab bars, toolbars, sheets) adopt it automatically; custom chrome must opt in explicitly with `.glassEffect(_:in:)`, and multiple glass shapes that visually relate should share a `GlassEffectContainer` so they morph together instead of rendering as separate blobs. Use `.buttonStyle(.glass)`/`.glassProminent` for actions that should read as system-native. Never apply glass to content that must remain legible under Reduce Transparency — check the environment value and fall back to an opaque material. Don't layer glass on glass. See `references/liquid-glass.md`.

## macOS

macOS SwiftUI apps have scene types with no iOS equivalent (`WindowGroup`, `Window`, `MenuBarExtra`, `Settings`, `DocumentGroup`) and view types suited to pointer/keyboard-driven UI (`Table` with `SortComparator`, `HSplitView`/`VSplitView`, `.focusable()`/`@FocusState`, `.draggable`/`.dropDestination`, `.onHover`). Fall back to `NSViewRepresentable` only when no SwiftUI equivalent exists, and keep the AppKit type wrapped behind that boundary rather than leaking it into the view tree. See `references/macos-scenes.md`, `references/macos-window-styling.md`, `references/macos-views.md`.

## Staying current

New SwiftUI APIs ship every year and some referenced here are recent (iOS 26 / macOS 26 era: Liquid Glass, `Chart3D`, `WebView`, `@Animatable`). When a task touches an API you're unsure is current, check `references/latest-apis.md` first, then verify against Apple's official documentation before committing to an approach — don't guess at API names or availability.

## Image handling

`AsyncImage` has no cross-view cache; for production use, wrap a caching image loader behind an internal abstraction rather than calling a third-party SDK directly from views. Get `.resizable()`, `.aspectRatio`/`.scaledToFit()`/`.scaledToFill()`, and modifier order (clip vs. frame) right, and downsample large images at decode time instead of after loading a full-resolution `UIImage`/`NSImage`. See `references/image-optimization.md`.
