# SwiftUI Scenes for macOS

A `Scene` declares a top-level UI grouping of an `App`. macOS apps typically compose several scene types in one `App` body; each scene type has distinct window-management semantics that don't exist on iOS.

```swift
@main
struct NotesApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        Settings {
            SettingsView()
        }
    }
}
```

## `WindowGroup` — multi-instance windows

The default choice. Each window in the group shares the same root view definition but keeps independent state; people can open as many as the platform allows.

```swift
WindowGroup {
    NoteEditorView()
}
.windowResizability(.contentSize)
.defaultSize(width: 480, height: 640)
```

Pass identifiable data to make each window represent a distinct model instance, and open new instances with `openWindow(value:)`:

```swift
WindowGroup("Note", for: Note.ID.self) { $noteID in
    if let noteID {
        NoteEditorView(noteID: noteID)
    } else {
        ContentUnavailableView("No Note Selected", systemImage: "note.text")
    }
}

struct SidebarView: View {
    @Environment(\.openWindow) private var openWindow
    let notes: [Note]

    var body: some View {
        List(notes) { note in
            Button(note.title) {
                openWindow(value: note.id)
            }
        }
    }
}
```

## `Window` — single-instance window

Use `Window` when exactly one instance should ever exist (an inspector, a log viewer, a dashboard) — the system brings the existing window forward instead of creating a duplicate.

```swift
Window("Activity Monitor", id: "activity-monitor") {
    ActivityMonitorView()
}
.windowResizability(.contentMinSize)
.defaultPosition(.topTrailing)
```

Toggle its visibility from anywhere with `openWindow(id:)` / `dismissWindow(id:)`, or with a `WindowVisibilityToggle` in a menu:

```swift
@Environment(\.openWindow) private var openWindow
@Environment(\.dismissWindow) private var dismissWindow

Button("Show Activity Monitor") { openWindow(id: "activity-monitor") }
Button("Hide Activity Monitor") { dismissWindow(id: "activity-monitor") }
```

## `MenuBarExtra` — persistent menu bar item

Renders as a persistent control in the system menu bar; available since macOS 13. Use it for background utilities, quick-glance status, or apps that live entirely in the menu bar (set `LSUIElement` in Info.plist to hide the Dock icon in that case — the app terminates automatically if the user removes the extra).

```swift
MenuBarExtra("Sync Status", systemImage: "arrow.triangle.2.circlepath") {
    SyncStatusMenuView()
}
.menuBarExtraStyle(.window) // .menu (default) for a compact menu, .window for a full custom view
```

For a toggleable presence (people can remove/re-add it, tracked via a binding):

```swift
@AppStorage("showsMenuBarExtra") private var showsMenuBarExtra = true

MenuBarExtra("Sync Status", systemImage: "arrow.triangle.2.circlepath", isInserted: $showsMenuBarExtra) {
    SyncStatusMenuView()
}
```

## `Settings` — the Preferences/Settings window

Exactly one `Settings` scene per app defines the window that opens from the app menu's "Settings…" item (`⌘,`), wired up automatically — no manual command needed. Present it programmatically with `SettingsLink`.

```swift
Settings {
    TabView {
        Tab("General", systemImage: "gearshape") { GeneralSettingsView() }
        Tab("Advanced", systemImage: "slider.horizontal.3") { AdvancedSettingsView() }
    }
    .scenePadding()
    .frame(width: 420)
}
```

## `DocumentGroup` — document-based apps

Declares the document types the app can open/create. The document model conforms to `FileDocument` (value type) or `ReferenceFileDocument` (reference type); SwiftUI wires up document-based menu items (New, Open, Save, Save As, Revert) automatically on macOS.

```swift
struct MarkdownDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.plainText]
    var text: String

    init(text: String = "") { self.text = text }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents,
              let string = String(data: data, encoding: .utf8) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        text = string
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(text.utf8))
    }
}

DocumentGroup(newDocument: MarkdownDocument()) { file in
    MarkdownEditorView(document: file.$document)
}
```

Pair with `DocumentGroupLaunchScene` to customize the launch/open panel presented before a document is chosen, instead of relying on the system default.

## `UtilityWindow` — secondary utility panel

A specialized window scene providing secondary utility to a main scene's content (palettes, inspectors that should look like an `NSPanel`-style auxiliary window rather than a full document window).

```swift
UtilityWindow("Color Palette", id: "palette") {
    ColorPaletteView()
}
.windowResizability(.contentSize)
```

## Sizing and positioning modifiers

```swift
WindowGroup {
    ContentView()
}
.defaultSize(width: 800, height: 600)
.defaultPosition(.center)
.windowResizability(.contentMinSize)   // sizes derived from content's minimum
```

`WindowResizability` values:
- `.automatic` — system default sizing/resizing behavior.
- `.contentSize` — the window's min/max are derived from the content's ideal/frame constraints; combine with an explicit `.frame(minWidth:maxWidth:minHeight:maxHeight:)` on the root view to bound resizing.
- `.contentMinSize` — only the *minimum* size is derived from content; the window can grow unbounded.

`defaultPosition(_:)` accepts a `UnitPoint`-like `Alignment` (`.center`, `.topLeading`, etc.) and only affects the window's *initial* placement — it has no effect on already-restored windows.

## `commands { }` — menu bar commands

Add or replace menu bar items alongside a scene, using `CommandGroup` and `CommandMenu`. This is the SwiftUI-native counterpart to overriding `NSApplication.mainMenu` directly.

```swift
WindowGroup {
    ContentView()
}
.commands {
    CommandGroup(replacing: .newItem) {
        Button("New Note") { /* ... */ }
            .keyboardShortcut("n", modifiers: .command)
    }
    CommandMenu("Format") {
        Button("Bold") { /* ... */ }
            .keyboardShortcut("b", modifiers: .command)
        Divider()
        Button("Italic") { /* ... */ }
            .keyboardShortcut("i", modifiers: .command)
    }
}
```

`CommandGroup(replacing:)` swaps out a system-defined group (`.newItem`, `.saveItem`, `.undoRedo`, `.pasteboard`, `.textEditing`, `.windowArrangement`, `.help`, etc.); `CommandGroup(after:)`/`.before(_:)` inserts alongside one without removing it. Commands declared this way automatically pick up standard-selector icons in macOS 26's refreshed menu appearance when you use the standard `Button` actions rather than custom views.

## `handlesExternalEvents(matching:)` — routing external events to a scene

Routes incoming `NSUserActivity`/URL-scheme events to a specific scene instance rather than always opening a new window. Requires the SwiftUI app lifecycle (`@main` `App` protocol) — it's unreliable when mixed with an `NSApplicationDelegateAdaptor`-only, AppKit-lifecycle app.

```swift
WindowGroup("Viewer", for: Document.ID.self) { $documentID in
    ViewerView(documentID: documentID)
}
.handlesExternalEvents(matching: ["viewer"])
```

From a view that should activate an *existing* matching window instead of creating a new one:

```swift
.handlesExternalEvents(preferring: ["viewer"], allowing: ["*"])
```

The system compares the strings you provide against the `targetContentIdentifier` of the incoming `NSUserActivity`.

## Multi-window architecture

Prefer many small, single-purpose scenes (a `WindowGroup` per document type, a `Window` per singleton utility, one `Settings`) over one `WindowGroup` that branches internally on a mode flag — each `Scene` gets independent state restoration, independent menu-command context (commands can query `@FocusedValue`/`@FocusedBinding` to act on whichever window is key), and independent lifecycle. Use `@Environment(\.openWindow)`/`dismissWindow` from any view instead of passing window-management closures down through the view tree.

```swift
struct InspectorCommands: Commands {
    @FocusedValue(\.selectedNote) private var selectedNote: Note?

    var body: some Commands {
        CommandMenu("Note") {
            Button("Duplicate") { /* uses selectedNote */ }
                .disabled(selectedNote == nil)
        }
    }
}
```

## Liquid Glass and window chrome on macOS 26 (Tahoe)

macOS 26 applies Liquid Glass to the window's top-level chrome — title bar, toolbar, and sidebar all sit in a shared translucent layer that reflects and refracts the content beneath, more subdued than iOS but present by default once you rebuild against the macOS 26 SDK. This is chrome-level and mostly automatic:

- `NavigationSplitView` sidebars, `.toolbar { }` content, and window title bars pick up the glass material with no code changes.
- Avoid placing a custom opaque `.background(_:)` directly behind a toolbar or sidebar — it will visibly clash with (or fully block) the system glass layer. Prefer `containerBackground(_:for: .window)` if you need to influence the window's background style, and let toolbars/sidebars manage their own material.
- If your app used a custom translucency hack pre-macOS 26 (`NSVisualEffectView` behind the sidebar, manual blur materials), remove it and let the system-provided Liquid Glass render instead — see `macos-window-styling.md` for the specific window-styling APIs affected.
