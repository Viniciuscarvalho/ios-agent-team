# macOS-Specific SwiftUI View Patterns

## `Table` for column-based data

`Table` is the macOS-native way to present sortable, multi-column tabular data — the SwiftUI equivalent of `NSTableView`. Sorting is driven by a `SortComparator`-conforming binding, not manual array mutation inside a tap handler.

```swift
struct Employee: Identifiable {
    let id: UUID
    var name: String
    var department: String
    var hireDate: Date
}

struct EmployeeTableView: View {
    @State private var employees: [Employee]
    @State private var sortOrder: [KeyPathComparator<Employee>] = [
        KeyPathComparator(\.name, order: .forward),
    ]

    var body: some View {
        Table(employees, sortOrder: $sortOrder) {
            TableColumn("Name", value: \.name)
            TableColumn("Department", value: \.department)
            TableColumn("Hired") { employee in
                Text(employee.hireDate, format: .dateTime.year().month().day())
            }
            .width(min: 100, ideal: 120)
        }
        .onChange(of: sortOrder) { _, newOrder in
            employees.sort(using: newOrder)
        }
    }
}
```

For multi-selection with contextual actions, bind `selection` to a `Set<Employee.ID>`:

```swift
struct SelectableEmployeeTableView: View {
    let employees: [Employee]
    @State private var selection = Set<Employee.ID>()

    var body: some View {
        Table(employees, selection: $selection) {
            TableColumn("Name", value: \.name)
            TableColumn("Department", value: \.department)
        }
        .contextMenu(forSelectionType: Employee.ID.self) { selectedIDs in
            Button("Remove", role: .destructive) {
                remove(selectedIDs)
            }
        } primaryAction: { doubleClickedIDs in
            open(doubleClickedIDs)
        }
    }

    private func remove(_ ids: Set<Employee.ID>) { /* ... */ }
    private func open(_ ids: Set<Employee.ID>) { /* ... */ }
}
```

## `List` with `.listStyle(.sidebar)`

The sidebar list style renders macOS's characteristic translucent, selectable outline navigation with disclosure groups for hierarchical sections — pair it with `NavigationSplitView` rather than driving it standalone:

```swift
enum SidebarItem: Hashable, Identifiable {
    case inbox, sent, project(String)
    var id: Self { self }
}

struct SidebarView: View {
    @Binding var selection: SidebarItem?
    let projects: [String]

    var body: some View {
        List(selection: $selection) {
            Section("Mail") {
                Label("Inbox", systemImage: "tray").tag(SidebarItem.inbox)
                Label("Sent", systemImage: "paperplane").tag(SidebarItem.sent)
            }
            Section("Projects") {
                ForEach(projects, id: \.self) { project in
                    Label(project, systemImage: "folder").tag(SidebarItem.project(project))
                }
            }
        }
        .listStyle(.sidebar)
    }
}
```

## `HSplitView` / `VSplitView`

Resizable, drag-handle-separated panes distinct from `NavigationSplitView`'s fixed sidebar semantics — reach for these for freeform, user-resizable pane layouts (an inspector next to a canvas, a log pane below an editor):

```swift
struct EditorWithInspectorView: View {
    var body: some View {
        HSplitView {
            EditorCanvasView()
                .frame(minWidth: 400)
            InspectorPanelView()
                .frame(minWidth: 220, maxWidth: 360)
        }
    }
}

struct EditorWithConsoleView: View {
    var body: some View {
        VSplitView {
            EditorCanvasView()
                .frame(minHeight: 200)
            ConsoleOutputView()
                .frame(minHeight: 100, maxHeight: 260)
        }
    }
}
```

Each child's `.frame(minWidth:/minHeight:)` sets the drag-resize floor; there is no built-in way to persist divider position — save it yourself via `@AppStorage` or `@SceneStorage` if the split should survive relaunch.

## Keyboard shortcuts

`.keyboardShortcut()` attaches a key equivalent to any `Button` or menu command, mirroring what would otherwise require an `NSMenuItem`:

```swift
struct DocumentToolbarView: View {
    var body: some View {
        HStack {
            Button("Save", action: save)
                .keyboardShortcut("s", modifiers: .command)
            Button("Save As…", action: saveAs)
                .keyboardShortcut("s", modifiers: [.command, .shift])
            Button("Close", action: close)
                .keyboardShortcut(.cancelAction)
        }
    }

    private func save() { /* ... */ }
    private func saveAs() { /* ... */ }
    private func close() { /* ... */ }
}
```

For app-wide menu bar commands (not just in-view buttons), declare them in `Commands`:

```swift
struct AppCommands: Commands {
    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("New Document", systemImage: "doc.badge.plus") { }
                .keyboardShortcut("n", modifiers: .command)
        }
    }
}
```

## Focus management

`@FocusState` tracks and drives keyboard focus for a specific field or control; `.focusable()` opts an otherwise non-focusable view (a custom control, not a `TextField`) into the focus chain and tab-key traversal that macOS users expect.

```swift
struct LoginFormView: View {
    enum Field: Hashable { case username, password }

    @FocusState private var focusedField: Field?
    @State private var username = ""
    @State private var password = ""

    var body: some View {
        Form {
            TextField("Username", text: $username)
                .focused($focusedField, equals: .username)
                .onSubmit { focusedField = .password }
            SecureField("Password", text: $password)
                .focused($focusedField, equals: .password)
                .onSubmit(submit)
        }
        .onAppear { focusedField = .username }
    }

    private func submit() { /* ... */ }
}

struct FocusableSwatchView: View {
    let color: Color
    @FocusState private var isFocused: Bool

    var body: some View {
        RoundedRectangle(cornerRadius: 6)
            .fill(color)
            .frame(width: 32, height: 32)
            .overlay {
                if isFocused {
                    RoundedRectangle(cornerRadius: 6).strokeBorder(.blue, lineWidth: 2)
                }
            }
            .focusable()
            .focused($isFocused)
            .onKeyPress(.return) {
                select()
                return .handled
            }
    }

    private func select() { /* ... */ }
}
```

## Context menus / right-click

`.contextMenu` attaches a right-click menu on macOS (long-press on iOS); prefer the selection-aware `contextMenu(forSelectionType:)` overload shown above for `List`/`Table` multi-selection so the menu reflects the whole selection, not just the row under the pointer.

```swift
struct FileRowView: View {
    let file: DocumentFile

    var body: some View {
        Label(file.name, systemImage: "doc")
            .contextMenu {
                Button("Rename", systemImage: "pencil") { rename(file) }
                Button("Duplicate", systemImage: "plus.square.on.square") { duplicate(file) }
                Divider()
                Button("Move to Trash", systemImage: "trash", role: .destructive) { trash(file) }
            }
    }

    private func rename(_ file: DocumentFile) { /* ... */ }
    private func duplicate(_ file: DocumentFile) { /* ... */ }
    private func trash(_ file: DocumentFile) { /* ... */ }
}
```

## Drag-and-drop with `.draggable` / `.dropDestination`

`.draggable(_:)` makes any view a drag source for a `Transferable` payload; `.dropDestination(for:)` accepts drops of a matching `Transferable` type — both work uniformly for in-app reordering and cross-app/Finder file interchange.

```swift
struct DocumentFile: Identifiable, Transferable {
    let id: UUID
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        ProxyRepresentation(exporting: \.url)
    }
}

struct DraggableFileRowView: View {
    let file: DocumentFile

    var body: some View {
        Label(file.url.lastPathComponent, systemImage: "doc")
            .draggable(file)
    }
}

struct DropZoneView: View {
    @State private var importedFiles: [DocumentFile] = []

    var body: some View {
        VStack {
            ForEach(importedFiles) { file in
                Text(file.url.lastPathComponent)
            }
        }
        .frame(minWidth: 200, minHeight: 200)
        .background(.quaternary)
        .dropDestination(for: DocumentFile.self) { droppedFiles, _ in
            importedFiles.append(contentsOf: droppedFiles)
            return true
        }
    }
}
```

For plain file URLs from Finder, `.dropDestination(for: URL.self)` accepts standard file-promise drags without any custom `Transferable` conformance.

## Hover effects

`.onHover` exposes mouse-hover enter/exit, unavailable as a concept on touch-only iOS — use it for pointer-driven affordances (highlighting a row, revealing an action button) that only make sense with a precise pointing device:

```swift
struct HoverableRowView: View {
    let title: String
    @State private var isHovering = false

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            if isHovering {
                Button("Delete", systemImage: "trash") { }
                    .buttonStyle(.borderless)
            }
        }
        .padding(.horizontal, 8)
        .background(isHovering ? Color.accentColor.opacity(0.1) : .clear)
        .onHover { hovering in
            isHovering = hovering
        }
    }
}
```

## `NSViewRepresentable` / `NSViewControllerRepresentable`

Bridge to AppKit only when SwiftUI has no equivalent (a legacy `NSTokenField`, `WKWebView`, a custom `NSView` subclass with behavior SwiftUI cannot express). Keep the bridge thin — one file, no domain logic — and route all app state through `Coordinator` to avoid retaining SwiftUI views inside AppKit delegate callbacks.

```swift
struct TokenFieldRepresentable: NSViewRepresentable {
    @Binding var tokens: [String]

    func makeNSView(context: Context) -> NSTokenField {
        let tokenField = NSTokenField()
        tokenField.delegate = context.coordinator
        return tokenField
    }

    func updateNSView(_ nsView: NSTokenField, context: Context) {
        nsView.objectValue = tokens
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(tokens: $tokens)
    }

    final class Coordinator: NSObject, NSTokenFieldDelegate {
        let tokens: Binding<[String]>

        init(tokens: Binding<[String]>) {
            self.tokens = tokens
        }

        func tokenField(_ tokenField: NSTokenField, representedObjectForEditing editingString: String) -> Any? {
            editingString
        }

        func controlTextDidChange(_ notification: Notification) {
            guard let field = notification.object as? NSTokenField,
                  let values = field.objectValue as? [String] else { return }
            tokens.wrappedValue = values
        }
    }
}
```

Use `NSViewControllerRepresentable` instead of `NSViewRepresentable` when the AppKit side is naturally a controller (e.g. wrapping `NSDocumentController`-adjacent flows or a controller-owned view lifecycle) — the pattern and `Coordinator` role are identical, only `makeNSViewController`/`updateNSViewController` replace the view-level methods.
