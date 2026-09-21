# Navigation & Sheet Presentation Patterns

## NavigationStack with type-safe destinations

Model routes as `Hashable` values, never as raw strings. Register one `navigationDestination(for:)` per route type; SwiftUI matches by type at push time.

```swift
enum ProfileRoute: Hashable {
    case userDetail(userIdentifier: String)
    case settings
    case editBio(initialText: String)
}

struct ProfileRootView: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            ProfileListView(path: $path)
                .navigationDestination(for: ProfileRoute.self) { route in
                    switch route {
                    case .userDetail(let userIdentifier):
                        UserDetailView(userIdentifier: userIdentifier)
                    case .settings:
                        SettingsView()
                    case .editBio(let initialText):
                        EditBioView(initialText: initialText)
                    }
                }
        }
    }
}

struct ProfileListView: View {
    @Binding var path: NavigationPath

    var body: some View {
        Button("Open settings") {
            path.append(ProfileRoute.settings)
        }
    }
}
```

`NavigationPath` type-erases heterogeneous `Hashable` routes, which lets one stack mix unrelated destination enums. The tradeoff: `NavigationPath` is only `Codable` if every element pushed onto it is `Codable`, and its contents are not inspectable (no `count`-based peeking of typed values). For state restoration or analytics that need to read the stack, keep a parallel typed array and derive the `NavigationPath` from it rather than trying to decode the path itself:

```swift
@Observable
final class ProfileNavigationRouter {
    private(set) var routes: [ProfileRoute] = []

    var path: NavigationPath {
        get { NavigationPath(routes) }
        set {
            // NavigationPath does not expose its elements, so a set from a
            // pop gesture can only be trusted for its count.
            if newValue.count < routes.count {
                routes.removeLast(routes.count - newValue.count)
            }
        }
    }

    func push(_ route: ProfileRoute) {
        routes.append(route)
    }

    func popToRoot() {
        routes.removeAll()
    }

    func pop() {
        guard !routes.isEmpty else { return }
        routes.removeLast()
    }
}
```

## Coordinator-style router as `@Observable`

Model navigation state as an `@Observable` router injected via the environment or initializer, not scattered `@State` per screen. This is the SwiftUI expression of the Coordinator pattern: the router owns the stack, views only request transitions.

```swift
@Observable
final class AppRouter {
    var path = NavigationPath()
    var presentedSheet: SheetRoute?
    var presentedFullScreenCover: FullScreenRoute?

    enum SheetRoute: Identifiable, Hashable {
        case createPost
        case editProfile(userIdentifier: String)

        var id: Self { self }
    }

    enum FullScreenRoute: Identifiable, Hashable {
        case onboarding

        var id: Self { self }
    }

    func push(_ route: ProfileRoute) {
        path.append(route)
    }

    func presentSheet(_ route: SheetRoute) {
        presentedSheet = route
    }

    func dismissSheet() {
        presentedSheet = nil
    }
}

struct RootView: View {
    @State private var router = AppRouter()

    var body: some View {
        NavigationStack(path: $router.path) {
            HomeView()
                .navigationDestination(for: ProfileRoute.self) { route in
                    ProfileDestinationView(route: route)
                }
        }
        .environment(router)
        .sheet(item: $router.presentedSheet) { sheetRoute in
            SheetDestinationView(route: sheetRoute)
        }
        .fullScreenCover(item: $router.presentedFullScreenCover) { coverRoute in
            FullScreenDestinationView(route: coverRoute)
        }
    }
}
```

Child views read the router from the environment and call intent methods (`router.push(...)`, `router.presentSheet(...)`) instead of owning presentation state themselves. This keeps navigation unidirectional and testable independent of the view hierarchy.

## NavigationSplitView for multi-column layouts

Use `NavigationSplitView` on iPad and macOS where a persistent sidebar or two/three-column layout is appropriate. It automatically collapses to a stack on compact-width iPhone layouts.

```swift
struct MailSplitView: View {
    @State private var selectedMailbox: Mailbox?
    @State private var selectedMessage: Message?

    var body: some View {
        NavigationSplitView {
            MailboxListView(selection: $selectedMailbox)
        } content: {
            if let selectedMailbox {
                MessageListView(mailbox: selectedMailbox, selection: $selectedMessage)
            } else {
                ContentUnavailableView("Select a mailbox", systemImage: "tray")
            }
        } detail: {
            if let selectedMessage {
                MessageDetailView(message: selectedMessage)
            } else {
                ContentUnavailableView("Select a message", systemImage: "envelope")
            }
        }
        .navigationSplitViewStyle(.balanced)
    }
}
```

Control column sizing with `.navigationSplitViewColumnWidth(min:ideal:max:)` on the sidebar/content column, and control the visibility of columns programmatically with a `NavigationSplitViewVisibility` binding when the detail should take over on compact devices:

```swift
struct AdaptiveSplitView: View {
    @State private var columnVisibility: NavigationSplitViewVisibility = .automatic

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            SidebarView()
        } detail: {
            DetailView()
        }
    }
}
```

## `.sheet(item:)` vs `.sheet(isPresented:)`

Prefer `.sheet(item:)` whenever the sheet's content is derived from a specific piece of identity. It eliminates the class of bugs where `isPresented` flips to `true` before the backing data is set (or stays `true` while the underlying model mutates to something unrelated).

```swift
struct PostListView: View {
    @State private var postToEdit: Post?

    var body: some View {
        List(posts) { post in
            Button(post.title) {
                postToEdit = post
            }
        }
        .sheet(item: $postToEdit) { post in
            EditPostView(post: post)
        }
    }
}
```

Reserve `.sheet(isPresented:)` for sheets with no associated identity, such as a static "compose" or "filters" sheet that reads independent `@State`:

```swift
struct FilterableListView: View {
    @State private var isShowingFilters = false

    var body: some View {
        ContentListView()
            .toolbar {
                Button("Filters") { isShowingFilters = true }
            }
            .sheet(isPresented: $isShowingFilters) {
                FiltersView()
            }
    }
}
```

Both forms accept an `onDismiss` closure for cleanup that must run regardless of how the sheet was dismissed (swipe or programmatic):

```swift
.sheet(item: $postToEdit, onDismiss: { analyticsLogger.logSheetDismissed() }) { post in
    EditPostView(post: post)
}
```

## `.fullScreenCover`

Use `.fullScreenCover` for flows that should not be swipe-dismissible by default and should not reveal the presenting content behind them — onboarding, paywalls, camera capture. It mirrors `.sheet`'s `item`/`isPresented` overloads:

```swift
.fullScreenCover(item: $router.presentedFullScreenCover) { route in
    switch route {
    case .onboarding:
        OnboardingFlowView()
    }
}
```

`.fullScreenCover` has no presentation detents and no drag indicator; if partial-height or resizable presentation is required, use `.sheet` instead.

## Presentation detents for partial-height sheets

```swift
struct QuickActionsSheet: View {
    @State private var selectedDetent: PresentationDetent = .medium

    var body: some View {
        QuickActionsListView()
            .presentationDetents([.medium, .large], selection: $selectedDetent)
            .presentationDragIndicator(.visible)
    }
}
```

Custom fractional or fixed-height detents:

```swift
.presentationDetents([.height(220), .fraction(0.4), .large])
```

Adapt content to the current detent by reading `PresentationDetent` through a custom identifier, or simply branch on `selectedDetent` in the view above. For a sheet that should stay compact and never grow, restrict to a single detent: `.presentationDetents([.height(180)])`.

## Interacting with content behind a sheet

By default, content behind a medium-height sheet is dimmed and non-interactive. `.presentationBackgroundInteraction` allows scrolling or interacting with the presenting view while a sheet is up — the pattern used by Maps' "search here" sheet over an interactive map:

```swift
struct MapWithSearchSheet: View {
    var body: some View {
        MapView()
            .sheet(isPresented: .constant(true)) {
                SearchResultsSheet()
                    .presentationDetents([.height(120), .medium, .large])
                    .presentationBackgroundInteraction(.enabled(upThrough: .medium))
                    .presentationDragIndicator(.visible)
            }
    }
}
```

`.enabled(upThrough:)` keeps the background interactive only while the sheet is at or below the given detent; past that detent the sheet takes over input, which is almost always the right default for a "large" full-content state.

## Programmatic dismissal via `@Environment(\.dismiss)`

Never thread a dismissal closure or an `isPresented` binding down through a sheet's content when `DismissAction` will do. It works uniformly for sheets, full-screen covers, and `NavigationStack` pops of the topmost destination.

```swift
struct EditPostView: View {
    @Environment(\.dismiss) private var dismiss
    let post: Post
    @State private var draftTitle: String

    init(post: Post) {
        self.post = post
        _draftTitle = State(initialValue: post.title)
    }

    var body: some View {
        Form {
            TextField("Title", text: $draftTitle)
        }
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    save()
                    dismiss()
                }
            }
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
        }
    }

    private func save() {
        // Persist draftTitle via a repository, not shown here.
    }
}
```

## Deep-linking a `NavigationPath` to app state

Tie incoming URLs or push-notification payloads to router mutations rather than to view-local state, so a deep link works whether the app is cold-launched or already running.

```swift
@Observable
final class DeepLinkRouter {
    var path = NavigationPath()
    var presentedSheet: AppRouter.SheetRoute?

    func handle(_ url: URL) {
        guard let host = url.host else { return }
        switch host {
        case "post":
            let identifier = url.lastPathComponent
            path.append(ProfileRoute.userDetail(userIdentifier: identifier))
        case "compose":
            presentedSheet = .createPost
        default:
            break
        }
    }
}

struct AppEntryView: View {
    @State private var router = DeepLinkRouter()

    var body: some View {
        NavigationStack(path: $router.path) {
            HomeView()
                .navigationDestination(for: ProfileRoute.self) { ProfileDestinationView(route: $0) }
        }
        .sheet(item: $router.presentedSheet) { SheetDestinationView(route: $0) }
        .onOpenURL { url in
            router.handle(url)
        }
    }
}
```

Reset `path` to an empty `NavigationPath()` before appending a new deep-link destination if the deep link should replace the current stack instead of pushing on top of it (e.g. a notification tap that should always land on a fresh detail screen).
