# SwiftUI View Structure and Composition

Reference for organizing SwiftUI view code: when to extract, how to compose, and what actually reduces diffing cost versus what just moves code around.

## Small focused views vs. monolithic views

A view type should represent one coherent piece of UI with one reason to change. Monolithic views — a single `body` with nested `VStack`/`HStack` blocks spanning hundreds of lines — are hard to read, hard to preview in isolation, and hard for SwiftUI to diff efficiently because the entire tree is one diffing unit driven by one set of dependencies.

```swift
// Monolithic: one body owns layout, formatting, and business display logic
struct OrderSummaryView: View {
    let order: Order

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(order.customerName)
                    .font(.headline)
                Spacer()
                Text(order.status.rawValue.capitalized)
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(order.status == .fulfilled ? Color.green : Color.orange)
                    .clipShape(Capsule())
            }
            ForEach(order.items) { item in
                HStack {
                    Text(item.name)
                    Spacer()
                    Text(item.price, format: .currency(code: "USD"))
                }
            }
            Divider()
            HStack {
                Text("Total")
                    .fontWeight(.bold)
                Spacer()
                Text(order.total, format: .currency(code: "USD"))
                    .fontWeight(.bold)
            }
        }
        .padding()
    }
}
```

```swift
// Composed: each responsibility is its own view
struct OrderSummaryView: View {
    let order: Order

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            OrderHeader(customerName: order.customerName, status: order.status)
            ForEach(order.items) { item in
                OrderLineRow(item: item)
            }
            Divider()
            OrderTotalRow(total: order.total)
        }
        .padding()
    }
}

struct OrderHeader: View {
    let customerName: String
    let status: OrderStatus

    var body: some View {
        HStack {
            Text(customerName).font(.headline)
            Spacer()
            StatusBadge(status: status)
        }
    }
}

struct StatusBadge: View {
    let status: OrderStatus

    var body: some View {
        Text(status.rawValue.capitalized)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(status == .fulfilled ? Color.green : Color.orange)
            .clipShape(Capsule())
    }
}
```

## When extraction helps vs. when it's just indirection

Extraction is worth it when the extracted piece:

- Has its own distinct state (`@State`) that would otherwise force the parent to re-render
- Is reused in more than one place
- Represents a named domain concept worth documenting/previewing independently
- Lets SwiftUI diff it as a stable, independently-identified subtree (see Performance reference for why this matters for re-render scope)

Extraction is **not** helping when it's a computed property or a one-line wrapper that:

- Has no state of its own
- Is used exactly once
- Just renames a stack of modifiers without changing the diffing unit (see `some View` vs. subview section below)

```swift
// Indirection without benefit: this is just body split across two properties
struct ProfileHeader: View {
    var body: some View {
        content
    }

    private var content: some View {
        HStack {
            avatar
            nameLabel
        }
    }

    private var avatar: some View { /* ... */ Image(systemName: "person.circle") }
    private var nameLabel: some View { /* ... */ Text("Name") }
}
```

None of `content`, `avatar`, `nameLabel` are separate diffing units — they're inlined into the same `body` evaluation at compile time. Splitting them helps *readability* only, not performance. That's a legitimate reason to do it, but don't confuse it with the performance benefit of an actual `struct: View` extraction.

## `ViewBuilder` and custom container views

`@ViewBuilder` lets a function or initializer accept a trailing-closure block of heterogeneous views, exactly like `VStack`/`HStack` do. Use it to build reusable containers with custom layout or behavior.

```swift
struct Card<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            content
        }
        .padding()
        .background(.regularMaterial, in: .rect(cornerRadius: 16))
    }
}

// Usage:
Card {
    Text("Title").font(.headline)
    Text("Subtitle").font(.subheadline).foregroundStyle(.secondary)
}
```

For containers that need conditional or multi-slot content (header + body, for example), take multiple `@ViewBuilder` closures:

```swift
struct SectionCard<Header: View, Body: View>: View {
    @ViewBuilder let header: Header
    @ViewBuilder let body: Body

    var content: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            Divider()
            body
        }
        .padding()
    }
}

// Usage:
SectionCard(
    header: { Text("Shipping Address").font(.headline) },
    body: { AddressForm() }
)
```

## `some View` vs. `AnyView`

`some View` is an opaque return type: the concrete type is fixed at compile time and known to the caller's context, even though it's not spelled out. This lets SwiftUI's diffing algorithm compare the view tree structurally without any indirection.

`AnyView` erases the concrete type behind a boxed existential. Every use of `AnyView` forces SwiftUI to diff by identity-of-box rather than by structural type — it cannot statically know whether the erased subtree changed shape, so it treats a change in the wrapped content conservatively (typically a full teardown/rebuild of that subtree rather than a minimal diff).

```swift
// Avoid: erases type information the differ needs
func statusView(for status: OrderStatus) -> AnyView {
    switch status {
    case .pending:
        return AnyView(ProgressView())
    case .fulfilled:
        return AnyView(Label("Done", systemImage: "checkmark"))
    }
}
```

```swift
// Prefer: conditional content stays statically typed via @ViewBuilder
@ViewBuilder
func statusView(for status: OrderStatus) -> some View {
    switch status {
    case .pending:
        ProgressView()
    case .fulfilled:
        Label("Done", systemImage: "checkmark")
    }
}
```

SwiftUI compiles `if`/`switch` inside a `@ViewBuilder` context into a `_ConditionalContent<TrueContent, FalseContent>` (or an n-way equivalent for `switch`), which is a real, statically-known type — this is the mechanism that makes heterogeneous branches diffable without erasure. Reach for `AnyView` only as a last resort — e.g., storing genuinely different view types in a homogeneous collection where `@ViewBuilder` isn't structurally possible — and prefer `some View` everywhere else, including generic view helpers:

```swift
protocol RowDisplayable {
    associatedtype RowContent: View
    @ViewBuilder var rowContent: RowContent { get }
}
```

## Computed properties returning `some View` vs. full subviews

A computed `var section: some View { ... }` is convenient for organizing a long `body`, but — as shown above — it is not an independent diffing unit; it's inlined at the call site every time the owning view's `body` runs. A full subview (`struct Section: View`) is:

```swift
// Computed property: re-evaluated inline every time the parent body runs
var itemsSection: some View {
    ForEach(order.items) { item in
        OrderLineRow(item: item)
    }
}

// Full subview: SwiftUI can skip re-rendering this subtree if its inputs are unchanged
struct ItemsSection: View {
    let items: [OrderItem]

    var body: some View {
        ForEach(items) { item in
            OrderLineRow(item: item)
        }
    }
}
```

Prefer full subviews over computed properties whenever the content:

- Depends on inputs that change less often than the rest of the parent's state
- Is large enough that skipping its re-render is worth the extra type

Computed properties are fine for small, cheap, always-changing-together pieces where the organizational win outweighs the (negligible) cost of always inlining them.

## Custom `ViewModifier` for reusable style logic

Extract repeated modifier chains into a `ViewModifier` rather than a free function returning `some View` — modifiers compose with `.modifier()` and can carry their own state/environment reads.

```swift
struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding()
            .background(.regularMaterial, in: .rect(cornerRadius: 16))
            .shadow(radius: 4, y: 2)
    }
}

extension View {
    func cardStyle() -> some View {
        modifier(CardStyle())
    }
}

// Usage:
VStack { Text("Balance"); Text("$1,204.55") }
    .cardStyle()
```

For modifiers needing parameters, add them to the struct:

```swift
struct Badge: ViewModifier {
    let color: Color

    func body(content: Content) -> some View {
        content
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color, in: .capsule)
    }
}

extension View {
    func badge(color: Color) -> some View {
        modifier(Badge(color: color))
    }
}
```

## Protocol-oriented view composition

Define behavior contracts as protocols with `associatedtype`-constrained `View` requirements, letting call sites stay generic and testable:

```swift
protocol LoadableContent: View {
    associatedtype LoadedView: View
    associatedtype LoadingView: View
    associatedtype ErrorView: View

    var state: LoadingState { get }
    @ViewBuilder var loaded: LoadedView { get }
    @ViewBuilder var loading: LoadingView { get }
    @ViewBuilder func error(_ error: Error) -> ErrorView
}

extension LoadableContent {
    @ViewBuilder
    var body: some View {
        switch state {
        case .idle, .loading:
            loading
        case .loaded:
            loaded
        case .failed(let error):
            self.error(error)
        }
    }
}
```

This pattern is most valuable for shared cross-feature scaffolding (loading/empty/error states, list screens) — don't reach for it for one-off views where a plain `struct: View` with a `switch` in `body` is simpler.

## File and type organization conventions

- **One primary view per file.** Small, tightly coupled private subviews used only by that view may live in the same file below it; anything reused elsewhere gets its own file.
- **File name matches the primary type name** (`OrderSummaryView.swift` contains `OrderSummaryView`).
- **Previews are colocated** in the same file using `#Preview`, placed at the bottom of the file, one per meaningfully different state:

```swift
#Preview("Fulfilled") {
    OrderSummaryView(order: .mockFulfilled)
}

#Preview("Pending") {
    OrderSummaryView(order: .mockPending)
}
```

- Keep files under ~300 lines; a `View` file exceeding that is usually a signal to extract a subview into its own file, not to keep splitting into same-file computed properties.
- Group by feature (`Features/Orders/OrderSummaryView.swift`), not by view "kind" (`Views/`, `Rows/`) — feature-first grouping keeps a view and its supporting subviews, view model, and tests discoverable together.
