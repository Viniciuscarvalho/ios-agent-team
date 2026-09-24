# Component Patterns Index

A short catalogue of common reusable UI components — buttons, cards, badges, form rows — and the pattern to reach for when building each. Use this file as a map; deeper cross-cutting concerns (navigation, sheets, async loading, performance) live in their own reference files, linked below.

## Buttons

Prefer a custom `ButtonStyle` over wrapping `Button` in another view when only the *visual* treatment changes — this preserves `Button`'s built-in accessibility, press-state handling, and hit-testing:

```swift
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(.tint, in: RoundedRectangle(cornerRadius: 12))
            .foregroundStyle(.white)
            .opacity(configuration.isPressed ? 0.7 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}
```

```swift
Button("Save Recipe") { save() }
    .buttonStyle(PrimaryButtonStyle())
```

Reach for a dedicated wrapper view instead of a `ButtonStyle` only when the "button" owns state beyond press (e.g., an async loading spinner replacing the label while a save is in flight) — see `references/async-state.md` for modeling that state as an enum, not a bare `Bool`.

## Cards

A card is typically a `VStack`/`HStack` with consistent padding, background, and corner radius — extract it as a `ViewModifier` once the same chrome repeats across 3+ call sites:

```swift
struct CardBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding()
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 16))
            .shadow(color: .black.opacity(0.05), radius: 8, y: 4)
    }
}

extension View {
    func cardStyle() -> some View {
        modifier(CardBackground())
    }
}
```

```swift
RecipeSummary(recipe: recipe)
    .cardStyle()
```

Cards that load remote images and async content combine this styling with the async-state and image-loading patterns in `references/async-state.md`. Cards inside a scrollable feed that should animate as they enter/leave view combine this with `references/scroll-reveal.md`.

## Badges / tags

Small, label-like views encoding a status or category. Keep them as plain views (not modifiers) since they have their own layout and often their own semantic color mapping:

```swift
struct StatusBadge: View {
    let status: RecipeStatus

    var body: some View {
        Text(status.label)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(status.tint.opacity(0.15), in: Capsule())
            .foregroundStyle(status.tint)
    }
}

extension RecipeStatus {
    var label: String {
        switch self {
        case .draft: "Draft"
        case .published: "Published"
        case .archived: "Archived"
        }
    }

    var tint: Color {
        switch self {
        case .draft: .orange
        case .published: .green
        case .archived: .gray
        }
    }
}
```

Driving color/label from a `switch` on the domain enum (not from raw strings passed in) keeps every badge in the app visually consistent by construction — there's no call site that can typo a color.

## Form rows

A settings/form row is a recurring `Label` + trailing accessory (chevron, toggle, value text) layout. Extract a generic row so every settings screen looks identical without copy-pasting the `HStack`:

```swift
struct SettingsRow<Accessory: View>: View {
    let title: String
    let systemImage: String
    @ViewBuilder var accessory: Accessory

    var body: some View {
        HStack {
            Label(title, systemImage: systemImage)
            Spacer()
            accessory
        }
    }
}
```

```swift
List {
    SettingsRow(title: "Notifications", systemImage: "bell") {
        Toggle("", isOn: $notificationsEnabled).labelsHidden()
    }
    SettingsRow(title: "Appearance", systemImage: "paintbrush") {
        Image(systemName: "chevron.right").foregroundStyle(.secondary)
    }
}
```

For navigable rows, pair this with `NavigationLink(value:)` from `references/navigationstack.md` instead of wrapping the row in a tappable `Button` — `List` + `NavigationLink` already provides the disclosure chevron and correct row-tap accessibility behavior.

## Empty / error states

Use the system `ContentUnavailableView` (iOS 17+) rather than a hand-rolled empty state view; see `references/async-state.md` for wiring it to a loading-state enum.

## Choosing the right abstraction

| Situation | Reach for |
|---|---|
| Same visual treatment, different label/content, no owned state | `ButtonStyle` / `LabelStyle` |
| Same modifier chain repeated 3+ times | `ViewModifier` + `View` extension |
| Component owns layout and/or state | Dedicated `View` struct |
| Component's visual identity depends on a domain enum | `switch` inside the component, not string/bool flags at call sites |

## Where to go next

- Composing components into full screens and flows: `references/navigationstack.md`, `references/sheets.md`
- Wiring components to real data and dependencies: `references/app-wiring.md`, `references/async-state.md`
- Keeping components fast as lists grow: `references/performance.md`
- Verifying components render correctly in isolation: `references/previews.md`
- Scroll-driven component reveal/parallax: `references/scroll-reveal.md`
- Components reachable via URL: `references/deeplinks.md`
