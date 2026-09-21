# Async State: `.task`, Image Loading, Loading/Error/Empty

Model the possible states of anything asynchronous as one enum, not a cluster of optionals and booleans. A view has exactly one `switch` over that enum, and every case is exhaustively handled — there is no representable "impossible" state like `isLoading == true && data != nil`.

## The loading state enum

```swift
enum LoadState<Value> {
    case idle
    case loading
    case loaded(Value)
    case failed(Error)
}
```

```swift
@Observable
final class RecipeListViewModel {
    private(set) var state: LoadState<[Recipe]> = .idle
    private let repository: any RecipeRepository

    init(repository: any RecipeRepository) {
        self.repository = repository
    }

    func load() async {
        state = .loading
        do {
            state = .loaded(try await repository.fetchAll())
        } catch {
            state = .failed(error)
        }
    }
}
```

```swift
struct RecipeListView: View {
    let viewModel: RecipeListViewModel

    var body: some View {
        content
            .task { await viewModel.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .idle, .loading:
            ProgressView()
        case .loaded(let recipes) where recipes.isEmpty:
            ContentUnavailableView(
                "No Recipes Yet",
                systemImage: "fork.knife",
                description: Text("Add your first recipe to get started.")
            )
        case .loaded(let recipes):
            List(recipes) { recipe in
                RecipeRow(recipe: recipe)
            }
        case .failed(let error):
            ContentUnavailableView {
                Label("Couldn't Load Recipes", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error.localizedDescription)
            } actions: {
                Button("Retry") {
                    Task { await viewModel.load() }
                }
            }
        }
    }
}
```

`ContentUnavailableView` (iOS 17+) is the standard system-provided view for empty and error states — prefer it over a hand-rolled `VStack` of icon + text unless you need a fully custom illustration.

## `.task` lifetime and cancellation

`.task` starts an async operation tied to the view's appearance and **automatically cancels it when the view disappears** — this is why network/database loading belongs in `.task`, not `.onAppear` with a manually-managed `Task {}`:

```swift
.task(id: recipeID) {
    await viewModel.load(recipeID: recipeID)
}
```

The `id:` overload restarts the task whenever `recipeID` changes, cancelling the in-flight one — the correct pattern for a detail view whose subject can change while it stays on screen (e.g., paging through a `NavigationPath` without popping).

Inside the loaded function, cooperate with cancellation for long-running work:

```swift
func load(recipeID: Recipe.ID) async {
    state = .loading
    do {
        try Task.checkCancellation()
        let recipe = try await repository.fetch(recipeID)
        state = .loaded(recipe)
    } catch is CancellationError {
        // Task was cancelled because the view changed/disappeared — leave state as-is.
    } catch {
        state = .failed(error)
    }
}
```

## Async image loading

`AsyncImage` covers the common case — give it explicit phases rather than relying on its default placeholder, so slow networks and failures both look intentional:

```swift
AsyncImage(url: recipe.imageURL) { phase in
    switch phase {
    case .empty:
        ProgressView()
    case .success(let image):
        image
            .resizable()
            .aspectRatio(contentMode: .fill)
    case .failure:
        Image(systemName: "photo")
            .foregroundStyle(.secondary)
    @unknown default:
        EmptyView()
    }
}
.frame(height: 200)
.clipShape(RoundedRectangle(cornerRadius: 12))
```

`AsyncImage` has no built-in disk cache — for lists with many images, or when you need cache control, wrap a caching image loader (e.g., backed by `URLCache` configured with a larger disk quota, or a dedicated library) behind the same phase-based interface so call sites don't change.

## Combining multiple async sources

When a screen needs two independent async calls that don't depend on each other, run them concurrently with `async let` rather than sequential `await`s:

```swift
func loadDashboard() async {
    state = .loading
    do {
        async let recipes = repository.fetchAll()
        async let favorites = repository.fetchFavoriteIDs()
        state = .loaded(Dashboard(recipes: try await recipes, favoriteIDs: try await favorites))
    } catch {
        state = .failed(error)
    }
}
```

## Common pitfalls

- **Using `.onAppear` + manual `Task { }` instead of `.task`.** You lose automatic cancellation, and the task keeps running (and can crash on stale state mutation) after the view disappears.
- **Representing loading state with independent `Bool`/optional flags.** `isLoading`, `error: Error?`, and `data: [Recipe]?` as three separate properties allow contradictory states (loading *and* showing stale error) that a single enum makes unrepresentable.
- **Forgetting the empty-but-loaded case.** `.loaded([])` is a distinct, common state that deserves its own UI, not the same list view rendering nothing.
