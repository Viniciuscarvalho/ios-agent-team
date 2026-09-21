# Swift Charts

Swift Charts renders data visualizations declaratively inside SwiftUI. A `Chart` is a container; you populate it with one or more mark types built from `PlottableValue`s via `.value(_:_:)`. Available since iOS 16; `SectorMark` (pie/donut) shipped in iOS 17 alongside scrolling and selection; `Chart3D` shipped in iOS 26.

## `Chart` basics

```swift
import Charts
import SwiftUI

struct DailySales: Identifiable {
    let id = UUID()
    let day: Date
    let revenue: Double
}

struct SalesChart: View {
    let sales: [DailySales]

    var body: some View {
        Chart(sales) { sample in
            BarMark(
                x: .value("Day", sample.day, unit: .day),
                y: .value("Revenue", sample.revenue)
            )
        }
        .frame(height: 240)
    }
}
```

`Chart` also accepts a trailing closure form when marks come from heterogeneous sources rather than a single collection:

```swift
Chart {
    ForEach(sales) { sample in
        BarMark(x: .value("Day", sample.day, unit: .day), y: .value("Revenue", sample.revenue))
    }
    RuleMark(y: .value("Target", 5_000))
        .foregroundStyle(.red)
}
```

## Mark types

### `BarMark`

```swift
BarMark(
    x: .value("Day", sample.day, unit: .day),
    y: .value("Revenue", sample.revenue)
)
.foregroundStyle(.blue.gradient)
```

Horizontal bars swap axis roles:

```swift
BarMark(
    x: .value("Revenue", sample.revenue),
    y: .value("Day", sample.day, unit: .day)
)
```

Grouped/stacked bars key off an extra `.value` and `position(by:)`:

```swift
BarMark(
    x: .value("Month", sample.month, unit: .month),
    y: .value("Revenue", sample.revenue)
)
.foregroundStyle(by: .value("Region", sample.region))
.position(by: .value("Region", sample.region))
```

Omit `position(by:)` with the same `foregroundStyle(by:)` value to stack instead of group.

### `LineMark`

```swift
LineMark(
    x: .value("Day", sample.day, unit: .day),
    y: .value("Revenue", sample.revenue)
)
.interpolationMethod(.catmullRom)
.symbol(.circle)
```

`interpolationMethod` also accepts `.linear` (default), `.monotone`, `.cardinal(tension:)`, and `.stepStart`/`.stepCenter`/`.stepEnd`.

### `PointMark`

```swift
PointMark(
    x: .value("Petal Length", flower.petalLength),
    y: .value("Petal Width", flower.petalWidth)
)
.foregroundStyle(by: .value("Species", flower.species))
.symbolSize(by: .value("Sepal Length", flower.sepalLength))
```

### `AreaMark`

```swift
AreaMark(
    x: .value("Day", sample.day, unit: .day),
    y: .value("Revenue", sample.revenue)
)
.foregroundStyle(
    .linearGradient(colors: [.blue.opacity(0.4), .clear], startPoint: .top, endPoint: .bottom)
)
```

Stacked area series (e.g. cumulative categories) use the same `foregroundStyle(by:)` pattern as `BarMark`. A stacked band between two y-values uses `yStart`/`yEnd`:

```swift
AreaMark(
    x: .value("Day", sample.day, unit: .day),
    yStart: .value("Low", sample.low),
    yEnd: .value("High", sample.high)
)
.opacity(0.3)
```

### `RuleMark`

Reference lines (thresholds, averages, "now" markers) that span the plot area on one axis:

```swift
RuleMark(y: .value("Average", average))
    .foregroundStyle(.red)
    .lineStyle(StrokeStyle(lineWidth: 1, dash: [6, 4]))
    .annotation(position: .top, alignment: .leading) {
        Text("Average: \(average, format: .number.precision(.fractionLength(0)))")
            .font(.caption)
            .foregroundStyle(.red)
    }
```

A vertical rule for a specific x-value works identically with `x: .value(...)`.

### `RectangleMark`

Builds heat maps: two categorical/discrete axes and color encodes intensity.

```swift
RectangleMark(
    x: .value("Hour", sample.hour),
    y: .value("Weekday", sample.weekday)
)
.foregroundStyle(by: .value("Intensity", sample.intensity))
```

### `SectorMark` (pie / donut)

```swift
Chart(products) { product in
    SectorMark(
        angle: .value("Revenue", product.revenue),
        innerRadius: .ratio(0.6),
        angularInset: 2
    )
    .foregroundStyle(by: .value("Product", product.title))
    .cornerRadius(4)
}
.chartLegend(position: .bottom, alignment: .center)
```

`innerRadius`/`outerRadius` accept `.ratio(_:)` (fraction of the plot radius), `.inset(_:)` (absolute inset in points), or `.fixed(_:)`. `innerRadius` greater than zero turns a pie into a donut. `angularInset` adds a gap between sectors.

## Series coloring: `foregroundStyle(by:)` and `chartForegroundStyleScale`

`foregroundStyle(by:)` maps a plottable value to color automatically from the chart's palette. Pin explicit colors per category with `chartForegroundStyleScale`:

```swift
Chart(sales) { sample in
    BarMark(x: .value("Month", sample.month, unit: .month), y: .value("Revenue", sample.revenue))
        .foregroundStyle(by: .value("Channel", sample.channel))
}
.chartForegroundStyleScale([
    "Online": Color.indigo,
    "Retail": Color.mint,
])
```

## Axis customization

```swift
Chart(sales) { sample in
    BarMark(x: .value("Day", sample.day, unit: .day), y: .value("Revenue", sample.revenue))
}
.chartXAxis {
    AxisMarks(values: .stride(by: .day)) { value in
        AxisGridLine()
        AxisTick()
        AxisValueLabel(format: .dateTime.weekday(.abbreviated))
    }
}
.chartYAxis {
    AxisMarks(position: .leading) { value in
        AxisGridLine()
        AxisValueLabel {
            if let revenue = value.as(Double.self) {
                Text(revenue, format: .currency(code: "USD"))
            }
        }
    }
}
```

Hide an axis entirely with `.chartXAxis(.hidden)` / `.chartYAxis(.hidden)`.

## `chartXScale` / `chartYScale`

Constrain the plotted domain or force a scale type independent of the data range:

```swift
Chart(sales) { sample in
    LineMark(x: .value("Day", sample.day, unit: .day), y: .value("Revenue", sample.revenue))
}
.chartXScale(domain: startOfMonth ... endOfMonth)
.chartYScale(domain: 0 ... 10_000, type: .linear)
```

`type` also accepts `.log`, `.symmetricLog`, and `.squareRoot` for numeric axes.

## Scrollable charts

```swift
Chart(sales) { sample in
    BarMark(x: .value("Day", sample.day, unit: .day), y: .value("Revenue", sample.revenue))
}
.chartScrollableAxes(.horizontal)
.chartXVisibleDomain(length: 3600 * 24 * 7)
.chartScrollTargetBehavior(.valueAligned(matching: .init(hour: 0), majorAlignment: .matching(.init(weekday: 2))))
```

`chartXVisibleDomain(length:)` fixes how much of the domain is visible at once (here, one week of `Date` data in seconds), independent of total data volume — combine with `chartScrollableAxes` for lazily-rendered, large time series.

## Interactive selection

Single-value selection binds a `@State` optional of the plotted value's type:

```swift
struct SelectableChart: View {
    let sales: [DailySales]
    @State private var selectedDay: Date?

    var body: some View {
        Chart(sales) { sample in
            LineMark(x: .value("Day", sample.day, unit: .day), y: .value("Revenue", sample.revenue))

            if let selectedDay, Calendar.current.isDate(sample.day, inSameDayAs: selectedDay) {
                RuleMark(x: .value("Selected", selectedDay))
                    .foregroundStyle(.gray.opacity(0.3))
                    .annotation(position: .top) {
                        Text(sample.revenue, format: .currency(code: "USD"))
                            .font(.caption.bold())
                            .padding(6)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 6))
                    }
            }
        }
        .chartXSelection(value: $selectedDay)
    }
}
```

`chartYSelection(value:)` mirrors this for the y-axis. Range selection binds a `ClosedRange` instead of an optional scalar:

```swift
@State private var selectedRange: ClosedRange<Date>?
// ...
.chartXSelection(value: $selectedRange)
```

On iOS the range gesture defaults to a two-finger drag; on macOS it's a single-finger drag.

## Annotations

Any mark accepts `.annotation` to overlay arbitrary SwiftUI content anchored to that mark's position:

```swift
BarMark(x: .value("Day", sample.day, unit: .day), y: .value("Revenue", sample.revenue))
    .annotation(position: .top) {
        Text(sample.revenue, format: .number.precision(.fractionLength(0)))
            .font(.caption2)
    }
```

`position` accepts `.top`, `.bottom`, `.leading`, `.trailing`, `.overlay`, and `.automatic`; combine with `alignment:` and `spacing:` for fine placement.

## Composing multiple mark types

Marks declared in the same `Chart` closure layer on the same coordinate space, which is how combo charts (bar + line, area + rule) are built:

```swift
Chart(sales) { sample in
    BarMark(x: .value("Day", sample.day, unit: .day), y: .value("Revenue", sample.revenue))
        .foregroundStyle(.blue.opacity(0.6))

    LineMark(x: .value("Day", sample.day, unit: .day), y: .value("7-Day Avg", sample.movingAverage))
        .foregroundStyle(.orange)
        .interpolationMethod(.catmullRom)
        .symbol(.circle)
}
```

When mixing marks that should not share a color/style scale (e.g. a bar series and an unrelated trend line), give the trend line an explicit `.foregroundStyle` rather than `foregroundStyle(by:)`, so it doesn't get folded into the categorical legend.

## `Chart3D` (iOS 26+)

`Chart3D` renders `PointMark`, `RuleMark`, `RectangleMark`, and `SurfacePlot` marks in a rotatable three-axis (x/y/z) space. Available on iOS 26, macOS 26, and visionOS 26.

```swift
import Charts

struct IrisScatter3D: View {
    let samples: [IrisSample]
    @State private var pose = Chart3DPose(azimuth: .degrees(0), inclination: .degrees(20))

    var body: some View {
        Chart3D(samples) { sample in
            PointMark(
                x: .value("Petal Length", sample.petalLength),
                y: .value("Petal Width", sample.petalWidth),
                z: .value("Sepal Length", sample.sepalLength)
            )
            .foregroundStyle(by: .value("Species", sample.species))
            .symbol(.cube)
            .symbolSize(0.05)
        }
        .chart3DPose($pose)
    }
}
```

Use a fixed, non-interactive angle with `.chart3DPose(.front)` (or another preset), or pass a plain `Chart3DPose` value instead of a binding when the user shouldn't be able to rotate the chart.

`SurfacePlot` renders a bivariate function `z = f(x, y)` directly, without a backing data collection:

```swift
Chart3D {
    SurfacePlot(x: "X", y: "Y", z: "Z") { x, z in
        sin(sqrt(x * x + z * z))
    }
    .foregroundStyle(.heightBased(colors: [.blue, .green, .yellow, .red]))
}
```

## Guidance for agents

- Reach for `Chart3D` only when a third variable is intrinsic to the data's meaning (e.g. spatial/mathematical surfaces); a 2D chart with color/size encoding is almost always more legible and more accessible.
- Prefer `chartXScale`/`chartYScale` over filtering the underlying data array when the goal is "zoom to this range" — it keeps axis marks consistent and avoids recomputation of derived series.
- Always pair a mark's `.value` labels with human-readable strings — they double as the accessible label shown by VoiceOver and the default legend text (see `charts-accessibility.md`).
