# NavigationStack & NavigationPath

`NavigationStack` (iOS 16+) replaced `NavigationView` for stack-based navigation. It models navigation as **data**: the stack's contents are driven by a path value, and pushing/popping is just mutating that value.

## Basic stack with typed data

For a flow with a single, homogeneous data type, bind the stack directly to an array:

```swift
struct Recipe: Hashable, Identifiable {
    let id: UUID
    let title: String
}

struct RecipeListView: View {
    @State private var path: [Recipe] = []

    var body: some View {
        NavigationStack(path: $path) {
            List(recipes) { recipe in
                NavigationLink(recipe.title, value: recipe)
            }
            .navigationDestination(for: Recipe.self) { recipe in
                RecipeDetailView(recipe: recipe)
            }
        }
    }
}
```

`NavigationLink(value:)` pushes `recipe` onto `path` without any imperative call. Tapping back pops it automatically. Programmatic push/pop is just array mutation:

```swift
path.append(recipe)      // push
path.removeLast()        // pop one
path.removeAll()         // pop to root
```

## Heterogeneous routes with NavigationPath

When a flow pushes multiple unrelated types (a search result, a settings screen, a profile), use `NavigationPath`, a type-erased, `Codable`-when-possible collection of `Hashable` values:

```swift
enum Route: Hashable {
    case recipeDetail(Recipe.ID)
    case profile(User.ID)
    case settings
}

@Observable
final class AppRouter {
    var path = NavigationPath()

    func push(_ route: Route) {
        path.append(route)
    }

    func popToRoot() {
        path.removeLast(path.count)
    }

    func pop() {
        guard !path.isEmpty else { return }
        path.removeLast()
    }
}
```

```swift
struct RootView: View {
    @State private var router = AppRouter()

    var body: some View {
        NavigationStack(path: $router.path) {
            HomeView()
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .recipeDetail(let id):
                        RecipeDetailView(recipeID: id)
                    case .profile(let id):
                        ProfileView(userID: id)
                    case .settings:
                        SettingsView()
                    }
                }
        }
        .environment(router)
    }
}
```

**Prefer a single `enum Route` over `NavigationPath` when every possible destination is known at compile time.** `NavigationPath` is only necessary when the set of pushable types isn't closed (e.g., a generic list screen reused across features) or when you need heterogeneous types without a shared enum. Wrapping everything in one `Route` enum gives you exhaustive `switch` coverage and avoids `NavigationPath`'s runtime type-erasure and its narrower `Codable` restrictions (every element must itself be `Codable` for the whole path to encode).

## Coordinator pattern

Keep the router/coordinator as the single owner of navigation state, injected via `@Environment`, so leaf views never import navigation logic — they just call `router.push(.recipeDetail(id))`:

```swift
struct RecipeRow: View {
    @Environment(AppRouter.self) private var router
    let recipe: Recipe

    var body: some View {
        Button(recipe.title) {
            router.push(.recipeDetail(recipe.id))
        }
    }
}
```

This keeps `RecipeRow` decoupled from *how* navigation happens — it can be previewed and tested without a real `NavigationStack`, and the coordinator can be swapped or mocked in tests.

## Programmatic pop and multi-level navigation

Popping to a specific point in the stack is just truncating the path/array to that index:

```swift
func popTo(_ route: Route) {
    guard let index = /* your own lookup */ 0 as Int? else { return }
    path.removeLast(path.count - index - 1)
}
```

For "pop to root from anywhere," store the router in `@Environment` and call `router.popToRoot()` from a tab bar's "tap active tab again" handler or a toolbar button — no `UINavigationController` bridging required.

## Restoring a saved path

`NavigationPath` supports `codable` round-tripping when every pushed element is `Codable`, which is what makes state restoration and deep-link replay possible:

```swift
struct CodableRoute: Codable, Hashable {
    let kind: String
    let identifier: String
}

if let data = try? JSONEncoder().encode(router.path.codable) {
    // persist `data`
}

if let representation = try? JSONDecoder().decode(NavigationPath.CodableRepresentation.self, from: data) {
    router.path = NavigationPath(representation)
}
```

If you use a closed `Route` enum instead of `NavigationPath`, restoration is simpler: persist `[Route]` directly with `Codable` conformance on `Route`, no bridging type needed. See `references/deeplinks.md` for using the same `Route` type to drive both deep links and saved-state restoration.

## Multiple stacks (tabs, split view)

Each tab in a `TabView` should own its own `NavigationStack` and its own path — don't share one path across tabs, or switching tabs will corrupt back-stack expectations:

```swift
struct RootTabView: View {
    @State private var homeRouter = AppRouter()
    @State private var searchRouter = AppRouter()

    var body: some View {
        TabView {
            NavigationStack(path: $homeRouter.path) { HomeView() }
                .tabItem { Label("Home", systemImage: "house") }

            NavigationStack(path: $searchRouter.path) { SearchView() }
                .tabItem { Label("Search", systemImage: "magnifyingglass") }
        }
    }
}
```

For iPad/macOS master-detail layouts, use `NavigationSplitView` instead of nesting `NavigationStack`s — it manages column visibility and detail replacement, which `NavigationStack` alone doesn't model.

## Common pitfalls

- **Registering `navigationDestination` on the wrong view.** It must be attached inside the `NavigationStack`'s content, not on the pushed destination itself, or the stack won't find it.
- **Mixing `NavigationLink(destination:)` (eager view init) with data-driven navigation.** Once you adopt path-based navigation, use `NavigationLink(value:)` everywhere in that stack — mixing styles makes the path an incomplete source of truth.
- **Deep, unbounded paths from repeated pushes of the same type without dedup.** Guard against pushing a duplicate detail screen if the user double-taps.
