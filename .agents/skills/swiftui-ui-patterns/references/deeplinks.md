# Deep Links & URL-Based Navigation

Deep links should resolve into the *same* route representation used by programmatic navigation (see `references/navigationstack.md`), so there is exactly one place that knows "what screens exist and how to get to them."

## Handling incoming URLs

```swift
struct MyApp: App {
    @State private var router = AppRouter()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(router)
                .onOpenURL { url in
                    router.handle(url)
                }
        }
    }
}
```

`onOpenURL` fires for custom URL schemes and registered Universal Links. It delivers a single `URL`; parsing and routing decisions belong in the router, not in the view.

## Parsing URLs into routes

Keep parsing pure and testable — a function from `URL` to `Route?`, with no side effects:

```swift
enum Route: Hashable {
    case recipeDetail(Recipe.ID)
    case profile(User.ID)
    case settings
}

extension Route {
    init?(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else {
            return nil
        }

        let segments = components.path.split(separator: "/").map(String.init)

        switch segments.first {
        case "recipe":
            guard segments.count > 1, let id = UUID(uuidString: segments[1]) else { return nil }
            self = .recipeDetail(id)
        case "profile":
            guard segments.count > 1, let id = UUID(uuidString: segments[1]) else { return nil }
            self = .profile(id)
        case "settings":
            self = .settings
        default:
            return nil
        }
    }
}
```

This makes the parser directly unit-testable without touching SwiftUI:

```swift
@Test
func route_parsesRecipeDetailURL() {
    let url = URL(string: "myapp://recipe/8C2E1B3A-0000-0000-0000-000000000000")!
    #expect(Route(url: url) == .recipeDetail(UUID(uuidString: "8C2E1B3A-0000-0000-0000-000000000000")!))
}
```

## Routing into the navigation stack

The router owns both the `NavigationPath`/`[Route]` and the URL-handling entry point, so a deep link and a `NavigationLink` tap produce identical stack state:

```swift
@Observable
final class AppRouter {
    var path = NavigationPath()
    var selectedTab: Tab = .home

    func handle(_ url: URL) {
        guard let route = Route(url: url) else { return }
        navigate(to: route)
    }

    func navigate(to route: Route) {
        switch route {
        case .recipeDetail, .profile:
            selectedTab = .home
            path.append(route)
        case .settings:
            selectedTab = .settings
        }
    }
}
```

Note the tab switch before the push: a deep link into tab-scoped content needs to select the right tab *and* seed that tab's stack, otherwise the pushed view renders behind the wrong tab.

## Restoring navigation state across launches

If you persist `path` (see `references/navigationstack.md` for the `Codable` bridging), replay it the same way a deep link would be replayed — through `navigate(to:)` — so cold-start restoration and live deep links share one code path instead of two divergent implementations.

```swift
init(persistedRoutes: [Route] = []) {
    for route in persistedRoutes {
        navigate(to: route)
    }
}
```

## Universal Links vs custom scheme

- Universal Links (`https://yourapp.com/...`) require an associated domain entitlement and an `apple-app-site-association` file served from that domain; they fall back gracefully to Safari when the app isn't installed.
- Custom schemes (`myapp://...`) need no server-side file but fail silently (or open nothing) if the app isn't installed, and can be squatted by other apps registering the same scheme.
- Prefer Universal Links for anything shareable (emails, messages, web); reserve custom schemes for internal use (e.g., push notification payloads, widget taps) where you control both ends.

## Testing deep links without a server

Use `xcrun simctl openurl booted <url>` against a running simulator to validate the full path from URL to rendered screen, and keep `Route(url:)` parsing covered by unit tests so routing logic doesn't regress silently when a marketing team changes a URL scheme.

## Common pitfalls

- **Parsing the URL directly inside a view's `.onOpenURL`.** Push parsing into the router/model so it's testable and reusable from notification handlers, widgets, and Shortcuts intents.
- **Ignoring app state during the deep link.** If a route requires auth, check `router` or an auth service before pushing, and queue/redirect through a login flow instead of pushing a screen that will crash on missing data.
- **Divergent route enums for deep links vs. programmatic navigation.** If they're separate types, every new screen has to be wired twice and the two will drift.
