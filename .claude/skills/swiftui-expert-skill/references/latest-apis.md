# Latest SwiftUI APIs (iOS 26 / macOS 26 era)

Survey of SwiftUI APIs introduced with the iOS 26 / macOS 26 SDKs (WWDC25 onward). Availability annotations below assume the 26.0 SDK unless noted. For Liquid Glass materials, `.glassEffect`, `GlassEffectContainer`, and tab bar/toolbar glassification specifically, see this skill's Liquid Glass reference — this file only calls out the handful of hooks that intersect with the APIs below (tab search role, `scrollEdgeEffectStyle`) and does not duplicate general adoption guidance.

## WebKit for SwiftUI: `WebView` and `WebPage`

A first-party SwiftUI web view, replacing the `UIViewRepresentable`-wrapped `WKWebView` pattern for the common case. Ships as a cross-import overlay — it only becomes visible when a file imports **both** `SwiftUI` and `WebKit`.

```swift
import SwiftUI
import WebKit

struct SimpleBrowser: View {
    var body: some View {
        WebView(url: URL(string: "https://example.com"))
    }
}
```

For anything beyond "load and display" — progress, title, navigation, JavaScript — back the view with the `Observable` `WebPage` model instead:

```swift
struct BrowserView: View {
    @State private var page = WebPage()

    var body: some View {
        NavigationStack {
            WebView(page)
                .navigationTitle(page.title)
                .safeAreaInset(edge: .top) {
                    if page.isLoading {
                        ProgressView(value: page.estimatedProgress)
                            .progressViewStyle(.linear)
                    }
                }
        }
        .task {
            page.load(URLRequest(url: URL(string: "https://example.com")!))
        }
    }
}
```

`WebPage` exposes `url`, `title`, `isLoading`, `estimatedProgress`, and `hasOnlySecureContent`, plus `load(_:)`, `reload()`, and `callJavaScript(_:)` (async, throwing). Relevant view modifiers: `.webViewContentBackground(.hidden)`, `.webViewMagnificationGestures(.enabled)`, `.webViewLinkPreviews(.disabled)`, `.webViewTextSelection(.enabled)`, `.findNavigator(isPresented:)`.

Wrap `WebPage` behind an app-level abstraction rather than passing it directly into feature view models — it is still a WebKit-backed type and leaking it into domain code defeats the purpose of adopting a SwiftUI-native replacement.

## `@Animatable` macro

Synthesizes `Animatable` conformance (the `animatableData` boilerplate) for shapes, `View`s, `ViewModifier`s, and text renderers, from their stored properties. Available iOS 26+, macOS 26+ (and the other 26-versioned platforms).

```swift
@Animatable
struct ProgressRing: Shape {
    var progress: Double
    var lineWidth: Double

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.addArc(
            center: CGPoint(x: rect.midX, y: rect.midY),
            radius: min(rect.width, rect.height) / 2 - lineWidth / 2,
            startAngle: .degrees(-90),
            endAngle: .degrees(-90 + 360 * progress),
            clockwise: false
        )
        return path.strokedPath(StrokeStyle(lineWidth: lineWidth, lineCap: .round))
    }
}
```

Every stored property participates in interpolation by default. Exclude a property (e.g. a `Bool` flag or a reference type) with `@AnimatableIgnored`:

```swift
@Animatable
struct HighlightModifier: ViewModifier {
    var cornerRadius: Double
    @AnimatableIgnored var isEnabled: Bool

    func body(content: Content) -> some View {
        content.clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .opacity(isEnabled ? 1 : 0.4)
    }
}
```

This removes the manual `animatableData` computed property (typically an `AnimatablePair` chain) that was previously required for any multi-property animatable shape or modifier — prefer `@Animatable` over hand-written `animatableData` in all new Swift 6 code.

## Tab search role and sidebar-adaptable `TabView`

`Tab(role: .search)` marks a tab as the search entry point; the system visually separates it from other tabs and morphs it into a search field on activation:

```swift
TabView {
    Tab("Home", systemImage: "house") { HomeView() }
    Tab("Library", systemImage: "books.vertical") { LibraryView() }
    Tab(role: .search) { SearchView() }
}
```

`TabRole.search` is currently the only `TabRole` case. For apps that want tabs on iOS/watchOS but a sidebar on iPadOS/macOS without maintaining two navigation trees, use `tabViewStyle(.sidebarAdaptable)` with `TabSection` to group tabs into sidebar sections:

```swift
TabView {
    TabSection("Browse") {
        Tab("Home", systemImage: "house") { HomeView() }
        Tab("Library", systemImage: "books.vertical") { LibraryView() }
    }
    Tab(role: .search) { SearchView() }
}
.tabViewStyle(.sidebarAdaptable)
```

On compact/watchOS layouts this renders as a normal tab bar; on iPadOS/macOS it renders as a `NavigationSplitView`-style sidebar, driven from the same view tree.

## Toolbar refinements

New modifiers give explicit control over item collapse/overflow as the toolbar's available width shrinks:

```swift
.toolbar {
    ToolbarItemGroup {
        Button("Share", systemImage: "square.and.arrow.up") { share() }
        Button("Duplicate", systemImage: "plus.square.on.square") { duplicate() }
    }
    .visibilityPriority(.high)

    ToolbarItem {
        Button("Delete", systemImage: "trash", role: .destructive) { delete() }
    }
}
.toolbarOverflowMenu(for: .primaryAction)
.toolbarMinimizeBehavior(.onScrollDown)
```

- `.visibilityPriority(_:)` — keeps a higher-priority group visible longer as space runs out, instead of the system's default left-to-right truncation order.
- `.toolbarOverflowMenu(for:)` — permanently routes lower-priority items into an overflow menu rather than hiding them outright.
- `topBarPinnedTrailing` (a `ToolbarItemPlacement`) — pins a critical action (e.g. a primary "Done"/"Save") so it never gets pushed into overflow.
- `.toolbarMinimizeBehavior(.onScrollDown)` — collapses the navigation bar as the user scrolls down, expanding again on scroll up; pass `.never`/`.automatic` to opt out or defer to system default.

## `ScrollView` enhancements

`scrollEdgeEffectStyle(_:for:)` controls how content fades/blurs under bars as it scrolls beneath them — `ScrollView`, `List`, and `Form` all get a soft Liquid Glass blur by default in the 26 SDKs:

```swift
ScrollView {
    content
}
.scrollEdgeEffectStyle(.hard, for: .top)
```

Values: `.soft` (default blur), `.hard` (sharp cutoff, useful when the content itself already terminates cleanly at the edge), `.automatic`.

Programmatic scroll position tracking/setting uses a two-way `ScrollPosition` binding (building on iOS 17's identifier-based `scrollPosition(id:anchor:)`):

```swift
@State private var scrollPosition = ScrollPosition(edge: .top)

ScrollView {
    content
}
.scrollPosition($scrollPosition)
```

Assigning a new value to `scrollPosition` (e.g. `scrollPosition.scrollTo(edge: .bottom)`) animates the scroll view to it; reading it back reflects user-driven scrolling. Other scroll modifiers worth knowing: `.scrollClipDisabled()` (lets content overflow the scroll view's bounds, e.g. for shadow/parallax effects) and `.scrollBounceBehavior(_:axes:)` (controls bounce when content is smaller than the viewport).

## Rich text `TextEditor`

`TextEditor` now binds directly to `AttributedString`, unlocking the system's native bold/italic/underline/color/alignment formatting UI without hand-rolling a rich text stack:

```swift
struct NoteEditor: View {
    @State private var text = AttributedString("Meeting notes")

    var body: some View {
        TextEditor(text: $text)
    }
}
```

Selecting text surfaces the system formatting menu automatically. For custom formatting controls (a toolbar button that toggles bold, for instance), track an `AttributedTextSelection` alongside the string and mutate attributes within the selected range via `transformAttributes(in:)`:

```swift
struct FormattingToolbar: View {
    @Binding var text: AttributedString
    @Binding var selection: AttributedTextSelection

    var body: some View {
        Button("Bold") {
            text.transformAttributes(in: &selection) { container in
                let isBold = container.font?.isBold ?? false
                container.font = isBold ? .body : .body.bold()
            }
        }
    }
}
```

Reachable rich-text attributes and font resolution go through `AttributedString`, `AttributedTextSelection`, and `FontResolutionContext`; plain-text `TextEditor(text: Binding<String>)` remains unchanged for simple cases.

## Reorderable containers

`List`, `LazyVGrid`, and — for the first time — watchOS containers support user drag-to-reorder without a third-party dependency, via container-level reordering APIs rather than a bespoke `onMove` per-container reimplementation. Reach for the built-in reorder support before writing custom `DragGesture`-based reordering; it integrates with accessibility (VoiceOver reorder actions) automatically, which hand-rolled drag gestures do not.

## Presentation and data APIs

- Swipe actions (`.swipeActions`) are no longer `List`-row-only — they're expressed as a general presentation API usable on other container content.
- `AsyncImage` gained improved caching behavior for repeated loads of the same URL across view identity changes.
- `@Observable` types support lazy state initialization, avoiding eager computation of expensive default property values before a view actually needs them.
- A new `Document` protocol (with `WritableDocument`/`ReadableDocument` conformances) gives document-based apps direct, asynchronous, incremental disk I/O and progress reporting, plus snapshot-based diffing — a lower-level alternative to `FileDocument`/`ReferenceFileDocument` for apps that need fine control over how a document is read/written rather than round-tripping a full in-memory value each save.

## What was intentionally omitted

SwiftData did not receive iOS 26-specific SwiftUI-integration APIs beyond what shipped in iOS 18 (`@Query`, `#Index`, compound uniqueness constraints, `@Previewable` preview queries) that could be independently confirmed — this file does not claim any new SwiftData/SwiftUI integration point for the 26 SDKs. Treat any such claim from another source as unverified until corroborated against `developer.apple.com/documentation/swiftdata`.
