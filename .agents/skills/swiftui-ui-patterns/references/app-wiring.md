# App & Scene Composition, Dependency Injection

The `App`/`Scene` layer is where dependencies get constructed exactly once and handed down. Views should never construct their own services — they receive them.

## Minimal App/Scene shape

```swift
@main
struct RecipeApp: App {
    @State private var router = AppRouter()
    private let dependencies: AppDependencies

    init() {
        dependencies = AppDependencies.live()
    }

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(router)
                .environment(dependencies)
        }
    }
}
```

`AppDependencies` is constructed once in `init()`, not recreated per-`body`-evaluation — `App.body` can be called more than once, so anything expensive or stateful (a database connection, a network client) must live outside it, in a stored property or `@State`.

## Composing dependencies

Group related services into a single injectable container rather than injecting a dozen individual `@Environment` values. It keeps the environment surface small and makes swapping a whole dependency graph (e.g., for tests or previews) a one-line change:

```swift
@Observable
final class AppDependencies {
    let recipeRepository: any RecipeRepository
    let userSession: UserSession
    let analytics: any AnalyticsClient

    init(
        recipeRepository: any RecipeRepository,
        userSession: UserSession,
        analytics: any AnalyticsClient
    ) {
        self.recipeRepository = recipeRepository
        self.userSession = userSession
        self.analytics = analytics
    }

    static func live() -> AppDependencies {
        AppDependencies(
            recipeRepository: NetworkRecipeRepository(),
            userSession: UserSession(),
            analytics: FirebaseAnalyticsClient()
        )
    }

    static func preview() -> AppDependencies {
        AppDependencies(
            recipeRepository: InMemoryRecipeRepository(seed: .mock),
            userSession: UserSession(state: .authenticated(.mock)),
            analytics: NoOpAnalyticsClient()
        )
    }
}
```

Depend on protocols (`any RecipeRepository`), not concrete network types, so the live and preview/test graphs are interchangeable — see `swift-concurrency` skill for `Sendable` requirements on shared services, and `references/previews.md` for using `.preview()` in `#Preview`.

## Injecting into views

Views declare what they need via `@Environment`, and get it from whichever ancestor injected it — they don't know or care whether that's `.live()` or `.preview()`:

```swift
struct RecipeListView: View {
    @Environment(AppDependencies.self) private var dependencies
    @State private var viewModel: RecipeListViewModel?

    var body: some View {
        Group {
            if let viewModel {
                RecipeListContent(viewModel: viewModel)
            } else {
                ProgressView()
            }
        }
        .task {
            viewModel = RecipeListViewModel(repository: dependencies.recipeRepository)
        }
    }
}
```

For view models that don't need to wait on `.task`, initialize eagerly instead:

```swift
struct RecipeListView: View {
    @Environment(AppDependencies.self) private var dependencies
    @State private var viewModel: RecipeListViewModel

    init(dependencies: AppDependencies) {
        _viewModel = State(initialValue: RecipeListViewModel(repository: dependencies.recipeRepository))
    }
}
```

Prefer initializer injection (explicit parameter) over `@Environment` when a view's dependency is load-bearing and specific to that view — reserve `@Environment` for cross-cutting, broadly-shared services (session, theme, feature flags) where threading an explicit parameter through every intermediate view would be pure boilerplate.

## Multiple scenes and window handling

Apps that support multiple windows (iPad, macOS, visionOS) should keep per-window state (like `AppRouter`) scoped to the `Scene`, while app-wide singletons (like `AppDependencies`) are created once in the `App` and shared across scenes:

```swift
@main
struct RecipeApp: App {
    private let dependencies = AppDependencies.live()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(AppRouter())   // fresh router per window
                .environment(dependencies)  // shared across windows
        }

        WindowGroup("Recipe Detail", for: Recipe.ID.self) { $recipeID in
            if let recipeID {
                RecipeDetailView(recipeID: recipeID)
                    .environment(dependencies)
            }
        }
        .handlesExternalEvents(matching: ["recipe-detail"])
    }
}
```

## Scene phase and lifecycle

React to backgrounding/foregrounding through `@Environment(\.scenePhase)`, not `UIApplicationDelegate` callbacks, when the behavior is view/feature scoped:

```swift
struct RootTabView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(AppDependencies.self) private var dependencies

    var body: some View {
        TabView { /* ... */ }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .background {
                    dependencies.analytics.flush()
                }
            }
    }
}
```

Reserve an actual `UIApplicationDelegate`/`UIApplicationDelegateAdaptor` only for APIs that require it (push notification registration, some background task scheduling) — everything else belongs in `Scene`/`scenePhase`.

## Common pitfalls

- **Constructing services inside `body`.** `App.body` and `View.body` can both be evaluated more than once; anything with identity (a database, a socket) must be a stored property, not a local in `body`.
- **One giant `@Environment` for the whole app state.** Splitting into focused containers (`AppDependencies`, `AppRouter`, `ThemeSettings`) means a change to one doesn't force every view depending on `@Environment` of *any* container to re-evaluate.
- **Leaking concrete SDK types into view code.** Wrap third-party SDKs (analytics, crash reporting, payments) behind a protocol defined in your own module; views and view models depend on that protocol only.
