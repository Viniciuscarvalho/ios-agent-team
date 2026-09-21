# SwiftUI State Management

Reference for choosing and applying property wrappers correctly. Targets Swift 6 / iOS 26 SDK, `@Observable` as the default observation model.

## `@State` — value-type local state

`@State` gives a view a persistent storage cell that survives across `body` re-evaluations, owned by the view identity in the view tree (not by the struct instance, which is re-created every render). Use it only for state that is:

- Local to the view (not needed by a parent or sibling)
- A value type (struct, enum, `String`, `Int`, `Bool`, arrays of value types)
- Or a reference type you want the *view* to own (see `@Observable` below)

```swift
struct CounterView: View {
    @State private var count = 0
    @State private var isExpanded = false

    var body: some View {
        VStack {
            Text("\(count)")
            Button("Increment") { count += 1 }
        }
    }
}
```

Always mark `@State` `private` — it is implementation detail of the view. If another view needs to read or write it, pass a `Binding`, don't widen access.

`@State` can also own a reference type marked `@Observable`:

```swift
@Observable
final class CheckoutFlow {
    var step: Step = .cart
}

struct CheckoutView: View {
    @State private var flow = CheckoutFlow()

    var body: some View {
        StepView(flow: flow)
    }
}
```

The view that instantiates the object owns it via `@State`. Descendant views that only need to *read/write* it (not own it) receive it as a plain `let`/parameter (if only reading properties SwiftUI still tracks access) or via `@Bindable` when they need two-way bindings.

## `@Binding` — two-way reference to state owned elsewhere

`@Binding` doesn't store a value; it's a get/set reference into state owned by an ancestor. Use it whenever a child view must mutate a value it doesn't own.

```swift
struct ParentView: View {
    @State private var username = ""

    var body: some View {
        UsernameField(username: $username)
    }
}

struct UsernameField: View {
    @Binding var username: String

    var body: some View {
        TextField("Username", text: $username)
    }
}
```

The `$` prefix projects a `Binding<Value>` out of a `@State`, `@Bindable`, or another `@Binding`. You can also construct one manually with `Binding(get:set:)` when deriving a binding from a computed value:

```swift
struct RangeSlider: View {
    @Binding var value: Double
    let bounds: ClosedRange<Double>

    private var normalized: Binding<Double> {
        Binding(
            get: { (value - bounds.lowerBound) / (bounds.upperBound - bounds.lowerBound) },
            set: { value = bounds.lowerBound + $0 * (bounds.upperBound - bounds.lowerBound) }
        )
    }

    var body: some View {
        Slider(value: normalized)
    }
}
```

Never store a `Binding` to a value you could instead own locally — that's the "passing bindings too deep" mistake below.

## `@Observable` — the modern observation model

The `@Observable` macro (Swift Observation framework) replaces `ObservableObject` + `@Published`. Apply it to any reference type; every stored property becomes independently tracked, with no per-property annotation required.

```swift
@Observable
final class OrderViewModel {
    var items: [OrderItem] = []
    var isSubmitting = false
    private(set) var total: Decimal = 0

    func addItem(_ item: OrderItem) {
        items.append(item)
        total += item.price
    }
}
```

Key properties of `@Observable`:

- **No `@Published` needed** — every non-computed, non-private-storage property is tracked automatically. Computed properties are tracked transitively through the stored properties they read.
- **Fine-grained invalidation** — a view only re-renders when it reads a property that actually changed, not on any mutation to the object (contrast with `ObservableObject`, which invalidates every subscriber on any `@Published` change via `objectWillChange`).
- **No property wrapper needed to observe** — a view can hold the object as a plain `let` and SwiftUI still tracks field access inside `body`. You only need `@State` (to own it) or `@Bindable` (to bind into it).
- Works with `@MainActor` isolation same as any class; mark the whole type `@MainActor` if it touches UI-affecting state from async contexts.

### Legacy `ObservableObject` (context only)

Older codebases (pre iOS 17) use:

```swift
final class LegacyViewModel: ObservableObject {
    @Published var count = 0
}
```

consumed via `@StateObject` (owning) or `@ObservedObject` (non-owning). Every `@Published` change invalidates *every* view observing the object, regardless of which property it reads — this is strictly worse than `@Observable`. Migrate to `@Observable` unless the deployment target predates iOS 17/macOS 14. Do not mix `@Published` with `@Observable` in the same type.

## `@Bindable` — bindings into an `@Observable` reference type

A plain reference to an `@Observable` object lets you *read* tracked properties, but you cannot write `$object.property` from it — `$` projection to produce a `Binding` requires `@Bindable`.

```swift
@Observable
final class ProfileEditor {
    var displayName = ""
    var bio = ""
}

struct ProfileEditForm: View {
    @Bindable var editor: ProfileEditor

    var body: some View {
        Form {
            TextField("Name", text: $editor.displayName)
            TextField("Bio", text: $editor.bio)
        }
    }
}
```

`ProfileEditForm` does not own `editor` — the caller does (typically via `@State`). `@Bindable` is a *local* annotation that unlocks binding syntax; it does not change ownership or lifetime.

```swift
struct ProfileScreen: View {
    @State private var editor = ProfileEditor()

    var body: some View {
        ProfileEditForm(editor: editor)
    }
}
```

## `@Environment` — implicit dependency injection

Use `@Environment` to pass data down the view tree without threading it through every initializer. Two flavors:

**Built-in environment values:**

```swift
struct ThemedView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Text(colorScheme == .dark ? "Dark" : "Light")
    }
}
```

**Custom `@Observable` types injected via `.environment(_:)`:**

```swift
@Observable
final class SessionStore {
    var currentUser: User?
}

// Injection point, typically at the app or scene root:
ContentView()
    .environment(sessionStore)

// Consumption anywhere below:
struct ProfileBadge: View {
    @Environment(SessionStore.self) private var sessionStore

    var body: some View {
        Text(sessionStore.currentUser?.name ?? "Guest")
    }
}
```

This is the modern replacement for `@EnvironmentObject`. It participates in the same fine-grained invalidation as any other `@Observable` read.

**Custom, non-observable environment values** still use `EnvironmentKey`:

```swift
private struct AnalyticsLoggerKey: EnvironmentKey {
    static let defaultValue: any AnalyticsLogging = NoOpAnalyticsLogger()
}

extension EnvironmentValues {
    var analyticsLogger: any AnalyticsLogging {
        get { self[AnalyticsLoggerKey.self] }
        set { self[AnalyticsLoggerKey.self] = newValue }
    }
}

// Usage:
Text("Checkout")
    .environment(\.analyticsLogger, ProductionAnalyticsLogger())
```

Prefer `@Environment(Type.self)` with `@Observable` for shared app state; reserve `EnvironmentKey` for lightweight config values, protocols, and dependencies that aren't observable state.

### `@EnvironmentObject` (legacy, context only)

```swift
struct LegacyBadge: View {
    @EnvironmentObject var sessionStore: LegacySessionStore // ObservableObject
}
```

Requires `.environmentObject(_:)` at the injection site, crashes at runtime (not compile time) if the type was never injected. `@Environment(Type.self)` with `@Observable` is safer — a missing injection still crashes on access, but the type relationship is explicit and the mechanism unifies with built-in environment values.

## `@AppStorage` / `@SceneStorage`

Persisted state backed by `UserDefaults` (`@AppStorage`) or scene restoration (`@SceneStorage`). Both support the same primitive types (`Bool`, `Int`, `Double`, `String`, `URL`, `Data`, and `RawRepresentable` enums).

```swift
struct SettingsView: View {
    @AppStorage("preferredTemperatureUnit") private var temperatureUnit = TemperatureUnit.celsius
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false

    var body: some View {
        Picker("Units", selection: $temperatureUnit) {
            ForEach(TemperatureUnit.allCases) { unit in
                Text(unit.displayName).tag(unit)
            }
        }
    }
}

enum TemperatureUnit: Int, CaseIterable, Identifiable {
    case celsius, fahrenheit
    var id: Self { self }
    var displayName: String { self == .celsius ? "°C" : "°F" }
}
```

```swift
struct DocumentEditorView: View {
    @SceneStorage("selectedTabIndex") private var selectedTabIndex = 0

    var body: some View {
        TabView(selection: $selectedTabIndex) {
            EditorTab().tag(0)
            PreviewTab().tag(1)
        }
    }
}
```

`@AppStorage` is for small user preferences, not domain data — it is not observable outside SwiftUI, has no migration story, and is synchronous disk I/O on every write. Don't store large blobs or model objects in it. `@SceneStorage` is for UI restoration state (selected tab, scroll position), scoped to a scene, cleared when the scene is discarded.

## Ownership rules

| Question | Answer |
|---|---|
| Who calls `= SomeType()`? | The owner. Use `@State` there. |
| Does this view only read/mutate fields of an object owned above it? | It's an observer, not an owner. Take the object as a plain property; add `@Bindable` locally only if you need `$object.field` bindings. |
| Does a value need to flow to a sibling? | Hoist it to the nearest common ancestor's `@State`, pass bindings/values down — never share `@State` across two independent view identities. |
| Is this app-wide/session-wide? | `@Environment` with `@Observable`, injected once near the root. |

A type should never be marked `@State` in more than one place in the tree — that creates two independent, desynchronized instances.

## Common mistakes

**State duplication** — mirroring parent state into a child's own `@State` instead of using a `Binding`:

```swift
// Wrong: child's isOn drifts from parent's source of truth
struct ToggleRow: View {
    let initialValue: Bool
    @State private var isOn: Bool

    init(initialValue: Bool) {
        self.initialValue = initialValue
        _isOn = State(initialValue: initialValue)
    }
}

// Right: single source of truth, child just binds to it
struct ToggleRow: View {
    @Binding var isOn: Bool
}
```

**Over-scoped `@State`** — hoisting state higher than needed forces a wider subtree to re-render:

```swift
// Wrong: keystroke-level search text lives in the screen, invalidating the whole screen body
struct ProductListScreen: View {
    @State private var searchText = ""
    var body: some View {
        VStack {
            ExpensiveHeader()
            ProductList()
            SearchField(text: $searchText)
        }
    }
}

// Right: push the state down into the view that actually needs it
struct ProductListScreen: View {
    var body: some View {
        VStack {
            ExpensiveHeader()
            ProductList()
            SearchField() // owns its own @State private var searchText
        }
    }
}
```

**Passing bindings too deep** — threading a `Binding` through three or four layers that don't read it, just to reach a leaf, is a sign the leaf should be extracted next to its owner, or the intermediate views should take an `@Observable` object instead of unpacking individual bindings.

**Reference types without `@Observable`** — a plain class held in `@State` with no `@Observable`/`ObservableObject` produces no view invalidation on mutation at all; SwiftUI has nothing to track.

## Decision table

| Need | Wrapper |
|---|---|
| Local value-type state, owned by this view | `@State` |
| Local reference-type (`@Observable`) state, owned by this view | `@State` |
| Write access to a value owned by an ancestor | `@Binding` |
| Read/act on an `@Observable` object owned elsewhere, no binding syntax needed | plain property (no wrapper) |
| Read *and* need `$object.field` binding syntax into an `@Observable` object owned elsewhere | `@Bindable` |
| App-/session-wide shared `@Observable` state | `@Environment(Type.self)` + `.environment(_:)` |
| Non-observable config/dependency injected implicitly | custom `EnvironmentKey` |
| Small persisted user preference | `@AppStorage` |
| Scene-scoped UI restoration value | `@SceneStorage` |
| (Legacy) shared observable object, pre-Observation framework | `@StateObject` / `@ObservedObject` / `@EnvironmentObject` with `ObservableObject` |
