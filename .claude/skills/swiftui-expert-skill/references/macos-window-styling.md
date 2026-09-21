# macOS Window Styling

Window chrome (title bar, toolbar material, background) is configured via scene modifiers on the `Scene` that creates the window, not on the content view itself. Reach for `NSWindow` interop only when a scene modifier genuinely doesn't expose the behavior you need.

## `.windowStyle(_:)`

```swift
WindowGroup {
    ContentView()
}
.windowStyle(.titleBar)          // default: standard title bar + toolbar row
```

```swift
WindowGroup {
    PlayerView()
}
.windowStyle(.hiddenTitleBar)    // hides title text and the title bar's backing material
```

`.hiddenTitleBar` (`HiddenTitleBarWindowStyle`) keeps the window's traffic-light controls but removes the title bar's visual background, letting your content extend into that region — useful for media players, canvases, or any window whose content should read as edge-to-edge. It does not remove the toolbar; combine with an empty `.toolbar { }` if you also don't want a toolbar row reserved.

There is also `.plain`, which removes standard chrome further for cases needing a fully custom window presentation (used with `ContainerBackgroundPlacement.window` for background control); reach for it only when `.hiddenTitleBar` isn't sufficient, since `.plain` opts out of more system-managed behavior.

## `.windowToolbarStyle(_:)`

Controls how the title bar and toolbar row combine:

```swift
WindowGroup {
    ContentView()
}
.windowToolbarStyle(.unified)            // title + toolbar items share one row (most apps)
```

- `.automatic` — system default for the platform/context.
- `.unified` — title and toolbar items share a single row. Good default for apps with a handful of toolbar items.
- `.unifiedCompact` — same single-row layout as `.unified` but with reduced vertical height; good when a window has few or no toolbar items but should still show a title bar without wasting vertical space.
- `.expanded` — title occupies its own row above a separate toolbar row, giving toolbar items more horizontal breathing room. Reach for this only when you have many toolbar items that would crowd a unified row.

```swift
.windowToolbarStyle(.unifiedCompact(showsTitle: true))
```

`showsTitle` on `.unifiedCompact` (and similar overloads) lets you suppress the window title text while keeping the compact row height.

## Toolbar content on macOS

`.toolbar { }` attaches to a view inside the scene (typically the root of `NavigationSplitView`/`NavigationStack`), not to the `Scene` itself:

```swift
NavigationSplitView {
    SidebarView()
} detail: {
    DetailView()
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button("Add", systemImage: "plus", action: addItem)
                Button("Delete", systemImage: "trash", action: deleteItem)
            }
            ToolbarItem(placement: .navigation) {
                Button("Toggle Sidebar", systemImage: "sidebar.left", action: toggleSidebar)
            }
        }
}
```

Common macOS placements: `.navigation` (leading, next to sidebar toggle), `.primaryAction` (trailing), `.principal` (center, e.g. a segmented control), `.status` (centered informational item). Group related actions in one `ToolbarItemGroup` so they visually share one Liquid Glass background on macOS 26; separate unrelated groups with `ToolbarSpacer(.fixed)` (see `liquid-glass.md`) rather than an empty spacer view.

## Full-size content view / extending content under the title bar

To let scrollable content show through the translucent title bar area (edge-to-edge look), ignore the safe area rather than manually resizing the window:

```swift
ScrollView {
    content
}
.toolbarBackground(.hidden, for: .windowToolbar)
.ignoresSafeArea(edges: .top)
```

Prefer `containerBackground(_:for: .window)` over reaching into `NSWindow` when you only need to change the window's background style (color, material, gradient) — it composes correctly with Liquid Glass on macOS 26, whereas a manual `NSVisualEffectView` behind everything can visually conflict with system-drawn glass in the title bar/toolbar.

```swift
WindowGroup {
    ContentView()
}
.containerBackground(.thinMaterial, for: .window)
```

## `NSWindow` interop — when SwiftUI alone isn't enough

Reach for this only for behavior with no SwiftUI scene-modifier equivalent: custom `NSToolbar` items backed by AppKit views, window delegate callbacks, `titlebarAppearsTransparent`/`styleMask` bit twiddling beyond what `.windowStyle` exposes, or reading live `NSWindow` frame/screen info.

```swift
private struct WindowAccessor: NSViewRepresentable {
    let onResolve: (NSWindow) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            if let window = view.window {
                onResolve(window)
            }
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

struct ContentView: View {
    var body: some View {
        RootView()
            .background(
                WindowAccessor { window in
                    window.titlebarAppearsTransparent = true
                    window.isMovableByWindowBackground = true
                }
            )
    }
}
```

The `DispatchQueue.main.async` is required: `makeNSView(context:)` runs before the view is inserted into a window, so `view.window` is `nil` at that point — deferring to the next run-loop turn lets AppKit finish attaching the view first. Only mutate window properties from this accessor that truly have no `Scene`-level modifier; anything expressible via `.windowStyle`, `.windowToolbarStyle`, or `.containerBackground(_:for: .window)` should use those instead, since they degrade gracefully with Liquid Glass and remain declarative.

For window delegate-style callbacks (did-resize, did-become-key), wrap `NSWindowDelegate` behind a small internal type rather than exposing `NSWindow` to domain code:

```swift
final class WindowDelegateProxy: NSObject, NSWindowDelegate {
    var onClose: (() -> Void)?

    func windowWillClose(_ notification: Notification) {
        onClose?()
    }
}
```

## macOS 26 Liquid Glass window chrome

Once built against the macOS 26 SDK, title bars, toolbars, and `NavigationSplitView` sidebars render with the Liquid Glass material by default — translucent, reflecting/refracting the content scrolling beneath them. Practical implications for window styling:

- **Remove custom translucency workarounds.** Pre-macOS 26 patterns that layered `NSVisualEffectView` or a semi-transparent `Color` behind the sidebar/toolbar to fake a "modern" look now double up with (or visually fight) the system material. Delete them and let `.windowStyle`/default toolbar rendering take over.
- **Audit `.toolbarBackground(_:for:)` overrides.** An explicit opaque background here suppresses the system glass; only set it when you deliberately want a solid toolbar (e.g. a print-preview-style window that shouldn't show content bleed-through).
- **Sidebar/inspector safe areas.** Content adjacent to a glass sidebar should respect the safe area insets the system provides so it doesn't render underneath the sidebar unexpectedly; use `backgroundExtensionEffect()` (see `liquid-glass.md`) if you deliberately want hero content to bleed under the sidebar with the system's blur-and-mirror treatment.
- **`.unifiedCompact`/`.unified` toolbar styles combine with glass automatically** — no additional material configuration needed to get the frosted look; it comes from the toolbar style plus the SDK, not from a separate modifier.
- **Test with Reduce Transparency on.** The system substitutes a more opaque, higher-contrast chrome automatically for standard toolbars/sidebars; verify any custom `NSWindow`-interop chrome you maintain does something reasonable too, since interop code bypasses the automatic adaptation.
