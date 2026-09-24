# Image Loading & Optimization

## `AsyncImage` basics and phases

`AsyncImage(url:)` with no closure gives you a default empty → image → (silently blank on failure) pipeline with no control over placeholders. Always use the `AsyncImagePhase` initializer when the loading/error states are user-visible:

```swift
struct RemoteAvatarView: View {
    let url: URL?

    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .empty:
                ProgressView()
                    .frame(width: 44, height: 44)
            case .success(let image):
                image
                    .resizable()
                    .scaledToFill()
                    .frame(width: 44, height: 44)
                    .clipShape(.circle)
            case .failure:
                Image(systemName: "person.crop.circle.badge.exclamationmark")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 44, height: 44)
                    .foregroundStyle(.secondary)
            @unknown default:
                EmptyView()
            }
        }
    }
}
```

## `AsyncImage` has no cache — wrap a loader behind an abstraction

`AsyncImage` re-fetches on every view identity change and keeps no disk or cross-view memory cache; scrolling a list of avatars away and back re-downloads them. For production apps, do not reach for a third-party SDK (Kingfisher, Nuke) directly inside views — wrap it behind a Repository-style protocol so the domain and view layer depend on an abstraction, not a vendor type:

```swift
protocol ImageLoading: Sendable {
    func image(for url: URL) async throws -> PlatformImage
}

/// Concrete adapter; the only file allowed to import the third-party SDK.
struct NukeImageLoader: ImageLoading {
    func image(for url: URL) async throws -> PlatformImage {
        try await ImagePipeline.shared.image(for: url)
    }
}
```

Expose a small `@Observable` view-model-friendly loader on top of the abstraction so views bind to `Image`, never to the SDK:

```swift
@MainActor
@Observable
final class RemoteImageLoader {
    private(set) var phase: AsyncImagePhase = .empty
    private let imageLoading: ImageLoading

    init(imageLoading: ImageLoading) {
        self.imageLoading = imageLoading
    }

    func load(_ url: URL) async {
        do {
            let platformImage = try await imageLoading.image(for: url)
            phase = .success(Image(platformImage: platformImage))
        } catch {
            phase = .failure(error)
        }
    }
}

struct CachedAsyncImageView: View {
    let url: URL
    @State private var loader: RemoteImageLoader

    init(url: URL, imageLoading: ImageLoading) {
        self.url = url
        _loader = State(initialValue: RemoteImageLoader(imageLoading: imageLoading))
    }

    var body: some View {
        Group {
            switch loader.phase {
            case .success(let image):
                image.resizable().scaledToFill()
            default:
                Color.secondary.opacity(0.15)
            }
        }
        .task { await loader.load(url) }
    }
}
```

This keeps `CachedAsyncImageView` swappable to a different caching SDK, or to an in-house `URLCache`-backed loader, without touching call sites.

## Resizable / aspect ratio correctness

`Image` is not resizable by default — a raw `Image(...)` renders at its intrinsic pixel size regardless of `.frame()`. Call `.resizable()` before any sizing modifier:

```swift
Image("hero")
    .resizable()
    .aspectRatio(contentMode: .fill)
    .frame(width: 320, height: 180)
    .clipped()
```

`.scaledToFit()` and `.scaledToFill()` are shorthand for `.aspectRatio(contentMode: .fit)` / `.aspectRatio(contentMode: .fill)`. `.fit` guarantees the whole image is visible, possibly leaving empty space inside the frame; `.fill` guarantees the frame is fully covered, possibly cropping the image. Never omit `.clipped()` after `.fill` inside a fixed frame — without it, the overflowing pixels still paint outside the frame's bounds and can bleed into sibling layout.

## Clipping vs framing order matters

Modifier order changes semantics because each modifier wraps the view produced by the previous one:

```swift
// Frame first, then clip: clips to the 100x100 frame.
Image("hero")
    .resizable()
    .scaledToFill()
    .frame(width: 100, height: 100)
    .clipShape(.rect(cornerRadius: 12))

// Clip first, then frame: clips to the image's *own* size (its native
// aspect-filled bounds before the frame is applied), then the frame
// resizes the already-clipped result — usually not what you want.
Image("hero")
    .resizable()
    .scaledToFill()
    .clipShape(.rect(cornerRadius: 12))
    .frame(width: 100, height: 100)
```

Rule of thumb: size first (`.resizable()`, `.aspectRatio`, `.frame`), then clip/mask, then apply borders/shadows/overlays last so they trace the final clipped shape:

```swift
Image("hero")
    .resizable()
    .scaledToFill()
    .frame(width: 100, height: 100)
    .clipShape(.rect(cornerRadius: 12))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(.separator))
```

## `Image(decorative:)` for purely decorative images

When an image conveys no information beyond visual flourish (a background texture, a divider glyph), use `Image(decorative:)` so VoiceOver skips it entirely instead of reading a filename or generic label:

```swift
Image(decorative: "background-texture")
    .resizable()
    .scaledToFill()
    .ignoresSafeArea()
```

If the image is meaningful, use `Image(_:)` with either an automatic asset-catalog accessibility label or an explicit `.accessibilityLabel(_:)`; never leave a meaningful image with no label and no `decorative` marking — that produces the worst outcome (unlabeled, but still announced).

## Downsampling before display

Decoding a full-resolution photo (e.g. 4000×3000) just to display it in a 60×60 thumbnail wastes decode time and memory — `UIImage(contentsOfFile:)` or `Image(uiImage:)` from a full-size source decodes at full resolution regardless of the eventual `.frame()`. Downsample at the `ImageIO` layer using `CGImageSourceCreateThumbnailAtIndex`, which decodes directly to the target size:

```swift
enum ImageDownsampler {
    static func downsampledImage(at url: URL, maxDimensionInPixels: CGFloat) -> CGImage? {
        let sourceOptions: [CFString: Any] = [kCGImageSourceShouldCache: false]
        guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, sourceOptions as CFDictionary) else {
            return nil
        }

        let thumbnailOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxDimensionInPixels,
        ]

        return CGImageSourceCreateThumbnailAtIndex(imageSource, 0, thumbnailOptions as CFDictionary)
    }
}
```

Compute `maxDimensionInPixels` from the on-screen point size times the display scale (`size * displayScale`), not from an arbitrary constant, so the thumbnail matches actual pixel density without over-decoding:

```swift
struct DownsampledThumbnailView: View {
    let url: URL
    let pointSize: CGFloat
    @Environment(\.displayScale) private var displayScale
    @State private var cgImage: CGImage?

    var body: some View {
        Group {
            if let cgImage {
                Image(decorative: cgImage, scale: displayScale)
                    .resizable()
                    .scaledToFill()
            } else {
                Color.secondary.opacity(0.15)
            }
        }
        .frame(width: pointSize, height: pointSize)
        .clipped()
        .task {
            let maxPixels = pointSize * displayScale
            cgImage = await Task.detached {
                ImageDownsampler.downsampledImage(at: url, maxDimensionInPixels: maxPixels)
            }.value
        }
    }
}
```

## `.drawingGroup()` for compositing many images cheaply

When a view composes many overlapping `Image`/shape layers (a badge stack, a collage, heavy blend modes), each layer is normally rendered and composited independently every frame. `.drawingGroup()` flattens the subtree into a single `CIImage`-backed offscreen render, composited once via Metal — a large win when animating many layered images simultaneously, at the cost of losing true resolution-independence for that subtree (it rasterizes at the current scale) and disabling some interactive hit-testing subtleties within it.

```swift
struct BadgeStackView: View {
    let badges: [Badge]

    var body: some View {
        ZStack {
            ForEach(badges) { badge in
                Image(badge.systemImageName)
                    .resizable()
                    .frame(width: 28, height: 28)
                    .offset(badge.offset)
                    .blendMode(.plusLighter)
            }
        }
        .drawingGroup()
    }
}
```

Only apply `.drawingGroup()` after profiling shows compositing (not decoding or layout) is the bottleneck — it adds an offscreen render pass and is a net loss for simple, infrequently-redrawn content.

## SF Symbols rendering

`.symbolRenderingMode` selects how a multi-layer symbol's colors are resolved:

```swift
Image(systemName: "cloud.sun.rain.fill")
    .symbolRenderingMode(.multicolor)

Image(systemName: "wifi")
    .symbolRenderingMode(.hierarchical)
    .foregroundStyle(.blue)

Image(systemName: "person.2.fill")
    .symbolRenderingMode(.palette)
    .foregroundStyle(.white, .blue)
```

- `.monochrome` (default with a single `foregroundStyle`): every layer takes the same color.
- `.hierarchical`: one base color, other layers derived at varying opacities — good for a single-tint icon with depth.
- `.palette`: assign distinct colors per layer via multiple `foregroundStyle` arguments, in layer order.
- `.multicolor`: uses the symbol's own built-in per-layer colors (e.g. weather symbols); `foregroundStyle` is ignored for colored layers.

Variable-color symbols (signal strength, battery, volume) animate or step through fill levels via `.variableColor` and a fractional value:

```swift
Image(systemName: "wifi", variableValue: signalStrength)
    .symbolRenderingMode(.hierarchical)

Image(systemName: "speaker.wave.3.fill")
    .symbolEffect(.variableColor.iterative, options: .repeating)
```

`.symbolEffect(_:)` (`.bounce`, `.pulse`, `.variableColor`, `.scale`) provides built-in, accessibility-respecting animations for symbols and should be preferred over manually animating `scaleEffect`/`opacity` on an SF Symbol.
