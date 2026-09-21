# Layout Best Practices

## The layout algorithm, briefly

SwiftUI layout is a three-pass negotiation, root to leaf then leaf to root:

1. A parent **proposes** a size to each child (`ProposedViewSize`, which may have `nil` dimensions meaning "you decide").
2. Each child **responds** with the size it actually wants, given that proposal — a `Text` measures its string, a `Color` accepts any proposal, a fixed `.frame` ignores the proposal entirely.
3. The parent **places** each child within its own bounds using the sizes just returned, applying its own alignment/spacing rules.

This is why a child cannot "reach up" and change its parent's size unless the parent explicitly asks (e.g. `HStack` sizes itself to fit its children's reported sizes, then re-proposes leftover space to flexible children). Understanding this explains most layout surprises: a `Text` inside a `ScrollView` with no width proposal keeps growing horizontally instead of wrapping, because nothing proposed a bounded width.

## `Spacer` and `Divider`

`Spacer` reports a minimum size of zero and greedily accepts any leftover space along the stack's axis — it is how you push siblings apart without a fixed offset:

```swift
HStack {
    Text("Title")
    Spacer()
    Text("Trailing detail")
}
```

`Spacer(minLength:)` sets a floor so it never compresses below a given point, useful when adjacent content might otherwise collide at small sizes. `Divider` draws a hairline perpendicular to its container's axis and takes the full cross-axis extent automatically — do not wrap it in a `.frame(height:)` to make it thicker; style it via `.background`/`.overlay` on a `Rectangle` instead if a custom thickness is required.

## `.frame()` pitfalls with Dynamic Type and localization

A fixed `.frame(width:height:)` on text-containing content is the most common source of clipped or truncated text under larger Dynamic Type sizes or longer localized strings:

```swift
// Fragile: breaks at larger text sizes or longer translations.
Text(titleText)
    .frame(width: 120, height: 24)

// Prefer: bound one axis, let the other grow, or use minWidth/idealWidth.
Text(titleText)
    .frame(minWidth: 120, alignment: .leading)
    .lineLimit(2)
    .fixedSize(horizontal: false, vertical: true)
```

Prefer `.frame(minWidth:idealWidth:maxWidth:)` over fixed dimensions for anything containing text, and reserve fixed `.frame` sizes for glyphs/icons/images with a known intrinsic size. Test layout at accessibility text sizes (`.dynamicTypeSize(.accessibility3)` in a preview) as a matter of course, not as an afterthought.

## `.fixedSize()`

`.fixedSize()` tells a view to report its *ideal* size instead of accepting the parent's proposed (possibly compressed) size — the opposite of the usual negotiation. It is most commonly needed to stop `Text` from wrapping/truncating when the parent would otherwise compress it:

```swift
Text(longLabel)
    .fixedSize(horizontal: false, vertical: true) // allow full vertical growth, keep horizontal flexible
```

`.fixedSize(horizontal: true, vertical: true)` (the parameterless overload's default) forces a view to its ideal size on both axes — useful for a `Text` that must never wrap inside an `HStack` that would otherwise compress it, at the risk of overflowing the container if the text is long.

## Custom alignment guides

Built-in alignments (`.leading`, `.center`, `.firstTextBaseline`, etc.) only align views that share a direct stack parent. To align across sibling subviews that live in different containers (e.g. aligning a label in one row with a value in another, regardless of each row's own internal layout), define a custom `AlignmentID`:

```swift
private struct LeadingLabelAlignment: AlignmentID {
    static func defaultValue(in context: ViewDimensions) -> CGFloat {
        context[HorizontalAlignment.leading]
    }
}

extension HorizontalAlignment {
    static let leadingLabel = HorizontalAlignment(LeadingLabelAlignment.self)
}

struct AlignedFormRowView: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .alignmentGuide(.leadingLabel) { dimensions in dimensions[.leading] }
            Text(value)
        }
    }
}

struct AlignedFormView: View {
    var body: some View {
        VStack(alignment: .leadingLabel, spacing: 8) {
            AlignedFormRowView(label: "Name", value: "Ada Lovelace")
            AlignedFormRowView(label: "Occupation", value: "Mathematician")
        }
    }
}
```

Every row's label edge lines up on the shared `.leadingLabel` guide even though each row is its own independent `HStack`.

## `Grid` for tabular layouts

`Grid` replaces brittle nested `HStack`/`VStack` combinations for genuinely tabular content, and — critically — synchronizes column widths across rows automatically, which nested stacks cannot do without manual `PreferenceKey` width propagation.

```swift
struct PricingGridView: View {
    var body: some View {
        Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
            GridRow {
                Text("Plan").bold()
                Text("Price").bold()
                Text("Seats").bold()
            }
            Divider().gridCellUnsizedAxes(.horizontal)
            GridRow {
                Text("Starter")
                Text("$9/mo")
                Text("1")
            }
            GridRow {
                Text("Team")
                Text("$29/mo")
                Text("10")
            }
            GridRow {
                Text("Enterprise")
                Text("Contact us")
                    .gridCellColumns(2)
            }
        }
    }
}
```

`.gridCellColumns(_:)` spans a cell across multiple columns; `.gridCellAnchor(_:)` positions a cell's content within its own cell bounds independent of the grid's overall alignment; `.gridCellUnsizedAxes(_:)` (as used on the `Divider` above) excludes a cell from influencing that axis's sizing, letting a full-width divider ignore column-width negotiation.

## `.layoutPriority()`

When an `HStack`/`VStack` must compress a child because total ideal width exceeds the available space, the default compression is roughly proportional. `.layoutPriority(_:)` (default `0`) tells the stack which children to protect from compression first — higher priority is asked to compress last:

```swift
HStack {
    Text(title)
        .layoutPriority(1)
    Text(subtitle)
        .foregroundStyle(.secondary)
        .lineLimit(1)
}
```

Here `subtitle` truncates before `title` ever loses space, because `title` has strictly higher priority. This is a lightweight alternative to `Spacer`/`fixedSize` tricks when the real goal is "this child wins the fight for space, that one loses it."

## `ViewThatFits`

`ViewThatFits` measures each candidate child against the space available and renders the first one that fits without needing manual `GeometryReader` size comparisons — ideal for adaptive layout switching (e.g. horizontal controls that collapse to vertical, or a full label that shrinks to an icon-only button):

```swift
struct AdaptiveToolbarView: View {
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack {
                Label("Share", systemImage: "square.and.arrow.up")
                Label("Duplicate", systemImage: "plus.square.on.square")
                Label("Delete", systemImage: "trash")
            }
            HStack {
                Image(systemName: "square.and.arrow.up")
                Image(systemName: "plus.square.on.square")
                Image(systemName: "trash")
            }
        }
    }
}
```

Each candidate is measured at its ideal size; the first whose ideal size fits the proposed space wins. Order candidates from most- to least-preferred, ending with a guaranteed-to-fit fallback.

## The `Layout` protocol for fully custom containers

When no combination of stacks, `Grid`, and alignment guides expresses the arrangement (radial layouts, flow/wrap layouts, masonry grids), implement `Layout` directly. It separates measurement (`sizeThatFits`) from placement (`placeSubviews`), and — unlike a computed-`body` container — participates in the real layout protocol, including layout priority and `ViewThatFits` measurement.

A minimal left-to-right wrapping "flow" layout:

```swift
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var currentRowWidth: CGFloat = 0
        var currentRowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0
        var totalWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentRowWidth + size.width > maxWidth, currentRowWidth > 0 {
                totalHeight += currentRowHeight + spacing
                totalWidth = max(totalWidth, currentRowWidth)
                currentRowWidth = 0
                currentRowHeight = 0
            }
            currentRowWidth += size.width + (currentRowWidth > 0 ? spacing : 0)
            currentRowHeight = max(currentRowHeight, size.height)
        }
        totalHeight += currentRowHeight
        totalWidth = max(totalWidth, currentRowWidth)

        return CGSize(width: totalWidth, height: totalHeight)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        var currentPoint = CGPoint(x: bounds.minX, y: bounds.minY)
        var currentRowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentPoint.x + size.width > bounds.maxX, currentPoint.x > bounds.minX {
                currentPoint.x = bounds.minX
                currentPoint.y += currentRowHeight + spacing
                currentRowHeight = 0
            }
            subview.place(at: currentPoint, anchor: .topLeading, proposal: ProposedViewSize(size))
            currentPoint.x += size.width + spacing
            currentRowHeight = max(currentRowHeight, size.height)
        }
    }
}

struct TagCloudView: View {
    let tags: [String]

    var body: some View {
        FlowLayout(spacing: 6) {
            ForEach(tags, id: \.self) { tag in
                Text(tag)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(.quaternary, in: .capsule)
            }
        }
    }
}
```

Use `cache` (the `()` above can be replaced with a real struct) to memoize per-subview measurements across repeated `sizeThatFits`/`placeSubviews` calls when subview measurement is expensive — SwiftUI calls both methods multiple times per layout pass, and recomputing every child's ideal size from scratch each time is wasted work for anything non-trivial.
