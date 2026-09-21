---
name: swiftui-ui-patterns
description: Best practices and example-driven guidance for building SwiftUI views and components, including navigation hierarchies, custom view modifiers, and responsive layouts with stacks and grids.
---

# SwiftUI UI Patterns

Guidance for structuring SwiftUI screens: how views compose, how navigation flows, how state is owned, and how layout adapts across size classes. This skill is architecture-first — it favors patterns that keep views declarative, testable, and free of hidden coupling.

Use the `references/` files for depth on a specific concern; this file is the map and the high-level rules.

## Core principles

1. **Views are value types that describe state, not mutate it.** A view's `body` should be a pure function of its inputs (`@State`, `@Binding`, `@Environment`, injected dependencies). Side effects belong in `.task`, `.onChange`, or an `@Observable` model — never inline in `body`.
2. **Navigation is data, not imperative calls.** Model navigation as a `NavigationPath` or `[Route]` array owned by a coordinator/router type. Views push routes by mutating that data; they never reach into a navigation controller. See `references/navigationstack.md`.
3. **Composition over configuration.** Prefer small views combined with `ViewBuilder` closures over one large view with a dozen boolean flags. If a view has more than ~4 conditional modifiers changing its identity, split it.
4. **Push state down, pull data up.** Local, UI-only state (`isExpanded`, `isPressed`) lives in the smallest view that needs it. Shared/business state lives in an `@Observable` model injected via `@Environment` or initializer, never as a singleton.
5. **Identity is not styling.** `ForEach` and `List` need stable `Identifiable`/`id` keys tied to domain identity, not array index — index-based identity breaks animations and causes state to leak between rows. See `references/performance.md`.

## Component composition

Reusable UI (buttons, cards, badges, form rows) should be built as small, styleable views or `ViewModifier`s, not copy-pasted per screen. Prefer:
- Custom `ButtonStyle`/`LabelStyle` over wrapping `Button` in another view when only visuals change.
- A `ViewModifier` + `extension View` helper when the same modifier chain repeats 3+ times.
- A dedicated view (not a modifier) when the component owns its own state or layout, not just styling.

See `references/components-index.md` for the concrete catalogue and cross-references into every other file in this skill.

## Navigation architecture

- Single `NavigationStack` per tab/flow, bound to a typed `NavigationPath` or `[Route]` owned by a coordinator.
- `navigationDestination(for:)` registered once, near the stack root — not scattered across leaf views.
- Deep links and push notifications decode into the same `Route` enum used for programmatic navigation, so there is one source of truth for "where can this app go." See `references/navigationstack.md` and `references/deeplinks.md`.
- Modal flows (`.sheet`, `.fullScreenCover`) are presentation, not navigation — don't put multi-step flows inside a sheet's `NavigationStack` unless the whole flow is meant to be dismissed as a unit. See `references/sheets.md`.

## Responsive layout

- Default to `VStack`/`HStack` with `ViewThatFits` or size-class-driven branching for adaptive layouts, not fixed pixel math.
- Use `LazyVGrid`/`LazyHGrid` with `GridItem(.adaptive(minimum:))` for content that should reflow based on available width (cards, thumbnails) rather than hardcoding a column count.
- Read `@Environment(\.horizontalSizeClass)` for coarse iPhone/iPad branching; use `GeometryReader` sparingly and only when you need the *exact* pixel size, since it breaks the natural sizing of its content and forces layout to the reader's bounds.
- Prefer `containerRelativeFrame(.horizontal)` over `GeometryReader` for grid items and paging views sized relative to their scroll container.

## App structure and state flow

- `@main` App structs wire dependencies once at the top and inject them via `@Environment` — see `references/app-wiring.md` for `Scene`/`WindowGroup` composition and DI patterns.
- Async data loading (network, disk) goes through `.task { }` tied to view lifetime, with explicit loading/error/empty states modeled as an enum — never three optional/bool flags. See `references/async-state.md`.
- Every custom view should have a `#Preview` with realistic mock data covering at least the empty, loaded, and error states where applicable. See `references/previews.md`.

## Performance and polish

- Avoid re-render storms: pass narrow, `Equatable` view models instead of whole app state; split views so only the part that changed re-evaluates. See `references/performance.md`.
- Scroll-driven reveal/parallax effects use `.scrollTransition` and `.onScrollGeometryChange` (iOS 18+), not manual `GeometryReader` offset math. See `references/scroll-reveal.md`.

## Reference index

| File | Covers |
|---|---|
| `references/components-index.md` | Reusable component catalogue: buttons, cards, badges, form rows |
| `references/navigationstack.md` | `NavigationStack`, `NavigationPath`, programmatic navigation, coordinators |
| `references/sheets.md` | `.sheet`, `.fullScreenCover`, presentation detents |
| `references/deeplinks.md` | URL-based deep linking, `onOpenURL`, path restoration |
| `references/app-wiring.md` | `App`/`Scene` composition, dependency injection into views |
| `references/async-state.md` | `.task`, async image loading, loading/error/empty states |
| `references/previews.md` | `#Preview` macro patterns, mock data, preview providers |
| `references/performance.md` | View identity, `Equatable`, avoiding unnecessary re-renders |
| `references/scroll-reveal.md` | Scroll-triggered animation, `.scrollTransition`, `.onScrollGeometryChange` |
