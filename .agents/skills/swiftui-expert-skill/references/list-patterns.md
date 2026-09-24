# SwiftUI List Patterns

Reference for building scrollable collections: choosing between `List` and manual lazy stacks, correct `ForEach` identity, and the standard list interaction modifiers.

## `List` vs. `LazyVStack`/`ScrollView`

`List` is a lazy, platform-native collection view (backed by `UITableView`/`UICollectionView`-equivalent machinery) that comes with built-in row separators, platform-appropriate insets, swipe actions, selection, and section chrome. Default to `List` for any row-based, scrollable content — it gives you far more for free than assembling the equivalent from `ScrollView` + `LazyVStack`.

```swift
struct InboxView: View {
    let messages: [Message]

    var body: some View {
        List(messages) { message in
            MessageRow(message: message)
        }
    }
}
```

Reach for `ScrollView { LazyVStack { ... } }` instead when you need:

- Custom, non-row layouts (grids of cards, staggered layouts, horizontal carousels)
- Full control over spacing/separators/backgrounds beyond what `List` styles expose
- Mixed content that doesn't read naturally as a flat list of homogeneous rows

```swift
struct StoryCarousel: View {
    let stories: [Story]

    var body: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 12) {
                ForEach(stories) { story in
                    StoryCard(story: story)
                }
            }
            .padding(.horizontal)
        }
    }
}
```

Both are lazy — the deciding factor is whether you want `List`'s built-in row semantics (selection, swipe actions, section headers, delete/move) or full layout control.

## `ForEach` identity

Always identify elements by a durable key, never by position:

```swift
// Preferred: Identifiable with a stable identifier from the model
struct Message: Identifiable {
    let id: UUID
    var subject: String
    var isRead: Bool
}

List(messages) { message in
    MessageRow(message: message)
}
```

```swift
// Acceptable: explicit id keypath for types you don't own or can't make Identifiable
List(remoteMessages, id: \.serverMessageID) { message in
    MessageRow(message: message)
}
```

```swift
// Dangerous: index as identity — breaks state and animation on any mutation
List(Array(messages.enumerated()), id: \.offset) { _, message in
    MessageRow(message: message)
}
```

Index identity means insert/delete/reorder reassigns "identity" to the wrong underlying data — swipe-to-delete on row 3 can visually delete row 4, in-flight text field edits or `@State` inside a row can attach to the wrong element, and List animations misrepresent what actually changed. Use a real identifier every time the collection can be mutated, filtered, or sorted at runtime.

## Swipe actions

```swift
List(messages) { message in
    MessageRow(message: message)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                delete(message)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .swipeActions(edge: .leading) {
            Button {
                toggleRead(message)
            } label: {
                Label(message.isRead ? "Unread" : "Read", systemImage: "envelope.badge")
            }
            .tint(.blue)
        }
}
```

The first button in a `.swipeActions` group becomes the "full swipe" default action; mark the destructive one with `role: .destructive` so it renders with the correct system styling.

## Context menus

```swift
List(messages) { message in
    MessageRow(message: message)
        .contextMenu {
            Button {
                toggleRead(message)
            } label: {
                Label(message.isRead ? "Mark Unread" : "Mark Read", systemImage: "envelope")
            }
            Button(role: .destructive) {
                delete(message)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
}
```

## `.listStyle()` variants

```swift
List(messages) { message in
    MessageRow(message: message)
}
.listStyle(.plain)      // no default insets/grouping chrome, edge-to-edge rows
.listStyle(.insetGrouped) // iOS Settings-style grouped, inset cards
.listStyle(.grouped)      // platform-default grouped sections
.listStyle(.sidebar)      // macOS/iPadOS sidebar appearance, collapsible sections
```

Pick `.insetGrouped` for form-like, grouped settings screens; `.plain` for feeds/timelines; `.sidebar` specifically for navigation sidebars on iPad/macOS.

## Sections

```swift
List {
    Section {
        ForEach(unreadMessages) { message in
            MessageRow(message: message)
        }
    } header: {
        Text("Unread")
    }

    Section {
        ForEach(readMessages) { message in
            MessageRow(message: message)
        }
    } header: {
        Text("Read")
    } footer: {
        Text("\(readMessages.count) messages")
    }
}
```

Group by `Section` rather than manually inserting header rows into a flat array — sections get correct sticky-header behavior, accessibility grouping, and index-title support (`.listSectionIndexVisibility` on iOS) for free.

## Pull-to-refresh

```swift
struct InboxView: View {
    @State private var messages: [Message] = []

    var body: some View {
        List(messages) { message in
            MessageRow(message: message)
        }
        .refreshable {
            messages = try await MessageService.shared.fetchLatest()
        }
    }
}
```

`.refreshable` expects an `async` closure; SwiftUI drives the spinner's lifecycle automatically and keeps it visible until the closure returns (or throws — wrap fallible calls with `try?` if you don't want the throw propagating).

## Search integration

```swift
struct InboxView: View {
    let messages: [Message]
    @State private var searchText = ""

    private var filteredMessages: [Message] {
        guard !searchText.isEmpty else { return messages }
        return messages.filter { $0.subject.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        List(filteredMessages) { message in
            MessageRow(message: message)
        }
        .searchable(text: $searchText, prompt: "Search messages")
    }
}
```

`.searchable` must be attached inside a `NavigationStack`/`NavigationSplitView` to get the platform-standard search bar placement (below the navigation title on iOS). Keep the filtering predicate cheap — it runs on every keystroke; for expensive filtering (fuzzy matching, remote search), debounce with `.task(id: searchText)` instead of filtering synchronously in a computed property.

## Selection

Single selection:

```swift
struct InboxView: View {
    let messages: [Message]
    @State private var selectedMessageID: Message.ID?

    var body: some View {
        List(messages, selection: $selectedMessageID) { message in
            MessageRow(message: message)
        }
    }
}
```

Multi-selection (typically paired with an edit mode toggle on iOS):

```swift
struct InboxView: View {
    let messages: [Message]
    @State private var selectedMessageIDs = Set<Message.ID>()
    @Environment(\.editMode) private var editMode

    var body: some View {
        List(messages, selection: $selectedMessageIDs) { message in
            MessageRow(message: message)
        }
        .toolbar {
            EditButton()
        }
    }
}
```

`selection:` binds to the element's `id` type (`Message.ID`, or a `Set` of it for multi-select) — not the element itself. Look up the full model from the ID when you need it.

## Deleting, moving, reordering

```swift
struct TaskListView: View {
    @State private var tasks: [Task]

    var body: some View {
        List {
            ForEach(tasks) { task in
                TaskRow(task: task)
            }
            .onDelete { offsets in
                tasks.remove(atOffsets: offsets)
            }
            .onMove { source, destination in
                tasks.move(fromOffsets: source, toOffset: destination)
            }
        }
        .toolbar {
            EditButton()
        }
    }
}
```

`.onDelete`/`.onMove` must be attached to the `ForEach` inside the `List`, not to the `List` itself, and only work reliably when the `ForEach` uses stable, durable identity (see above) — index-based identity combined with `.onMove` is a common source of visually-wrong reorders.

## Performance tips for large lists

**Avoid expensive computed properties inside row views.** A row's `body` runs for every visible (and soon-to-be-visible) row on every scroll frame; formatting, parsing, or filtering inline in the row multiplies that cost.

```swift
// Wrong: reformats on every row body evaluation
struct MessageRow: View {
    let message: Message
    var body: some View {
        Text(DateFormatter.longStyle.string(from: message.receivedAt)) // expensive DateFormatter alloc/config per call if not cached
    }
}

// Right: precomputed/cheap formatting
struct MessageRow: View {
    let message: Message
    var body: some View {
        Text(message.receivedAt, format: .dateTime.month().day())
    }
}
```

**Use stable IDs** (covered above) — this is doubly important in large lists because misidentified rows cause SwiftUI to recycle/rebuild far more rows per scroll than necessary.

**Avoid nested `ScrollView`s.** A `ScrollView` inside a `List` row (or inside another `ScrollView` on the same axis) breaks the outer view's ability to reason about total content size and defeats laziness for the nested content, which is usually fully instantiated up front. If a row needs horizontal scrolling content, constrain it explicitly and prefer `LazyHStack` inside a horizontal `ScrollView`, but never nest two scroll views on the same axis, and avoid a vertical `ScrollView`/`List` nested inside another vertical one — use a single `List` with mixed section content instead.

```swift
// Avoid: horizontal ScrollView nested inside a List row, re-instantiated per row
List(albums) { album in
    ScrollView(.horizontal) {
        HStack { ForEach(album.tracks) { TrackChip(track: $0) } }
    }
}
```

```swift
// Prefer: keep the row lightweight; if horizontal scrolling per row is required,
// keep the inner content lazy and minimal, or restructure as a grid/section instead of nested scroll containers.
List(albums) { album in
    AlbumRow(album: album) // AlbumRow shows a fixed, small track summary, not a full nested scroller
}
```

**Prefer `List`'s native diffing over manual array diffing/animation code** — mutate the bound array (`tasks.remove(atOffsets:)`, `tasks.move(...)`) and let `List` animate the change, rather than manually computing diffs and driving `withAnimation` around bespoke insert/remove logic.
