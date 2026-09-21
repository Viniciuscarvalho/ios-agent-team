# Swift Charts Accessibility

Swift Charts marks are drawn into a single opaque `Canvas`-backed view; VoiceOver cannot inspect individual bars or points without an explicit accessibility representation. Apple's supported path is `AXChartDescriptorRepresentable` + `.accessibilityChartDescriptor(_:)`, which drives both VoiceOver narration and the system's Audio Graph feature (introduced iOS 15) — a sonification of the data that plays on double-tap-and-hold.

Never rely on default `accessibilityLabel`/`accessibilityValue` alone for a `Chart`; they describe the chart as one opaque element ("image") at best. `AXChartDescriptor` is what lets VoiceOver users navigate point-by-point and hear the actual values.

## Core types

- `AXChartDescriptor` — the root object: `title`, `summary`, `xAxis`, `yAxis`, `additionalAxes`, `series`.
- `AXCategoricalDataAxisDescriptor` — for a discrete/string-keyed axis (`title`, `categoryOrder`).
- `AXNumericDataAxisDescriptor` — for a continuous axis (`title`, `range`, `gridlinePositions`, and a value-formatting closure).
- `AXDataSeriesDescriptor` — one logical series of points (`name`, `isContinuous`, `dataPoints`).
- `AXDataPoint` — one `(x, y)` value pair within a series, optionally with an additional label.

## Implementing `AXChartDescriptorRepresentable`

```swift
import Charts
import SwiftUI

struct WeeklyTemperatureDescriptor: AXChartDescriptorRepresentable {
    let samples: [DailyTemperature]

    func makeChartDescriptor() -> AXChartDescriptor {
        let xAxis = AXCategoricalDataAxisDescriptor(
            title: "Day",
            categoryOrder: samples.map(\.weekdayName)
        )

        let maxTemperature = samples.map(\.highTemperature).max() ?? 0

        let yAxis = AXNumericDataAxisDescriptor(
            title: "High Temperature",
            range: 0...maxTemperature,
            gridlinePositions: []
        ) { value in
            value.formatted(.number.precision(.fractionLength(0))) + "°"
        }

        let series = AXDataSeriesDescriptor(
            name: "Daily high temperature",
            isContinuous: false,
            dataPoints: samples.map { sample in
                AXDataPoint(x: sample.weekdayName, y: sample.highTemperature)
            }
        )

        return AXChartDescriptor(
            title: "Weekly high temperatures",
            summary: "Daily high temperatures for the current week, in degrees Fahrenheit.",
            xAxis: xAxis,
            yAxis: yAxis,
            additionalAxes: [],
            series: [series]
        )
    }
}
```

Attach it to the chart with `.accessibilityChartDescriptor(_:)`:

```swift
struct WeeklyTemperatureChart: View {
    let samples: [DailyTemperature]

    var body: some View {
        Chart(samples) { sample in
            LineMark(
                x: .value("Day", sample.weekdayName),
                y: .value("High Temperature", sample.highTemperature)
            )
        }
        .accessibilityChartDescriptor(WeeklyTemperatureDescriptor(samples: samples))
    }
}
```

`isContinuous: false` tells VoiceOver/Audio Graph to treat points as discrete steps (bar/line-per-category); set it `true` for dense continuous data (e.g. a sensor trace) so the sonification plays as a smooth sweep rather than discrete blips.

## Multi-series charts

Provide one `AXDataSeriesDescriptor` per series so VoiceOver can announce and switch between them, and set `name` to the human-readable series label used elsewhere (legend, `foregroundStyle(by:)` value):

```swift
func makeChartDescriptor() -> AXChartDescriptor {
    let series = channels.map { channel in
        AXDataSeriesDescriptor(
            name: channel.name,
            isContinuous: false,
            dataPoints: channel.samples.map { AXDataPoint(x: $0.month, y: $0.revenue) }
        )
    }

    return AXChartDescriptor(
        title: "Revenue by channel",
        summary: nil,
        xAxis: monthAxis,
        yAxis: revenueAxis,
        additionalAxes: [],
        series: series
    )
}
```

## Audio Graph support

Audio Graph is automatic once `accessibilityChartDescriptor` is attached — there is no separate opt-in API. VoiceOver users trigger it via the rotor ("Audio Graph" action) or by activating the chart and choosing "Play Audio Graph." What determines a good experience:

- `xAxis`/`yAxis` `title`s must be short, descriptive strings — they're spoken before each axis's values.
- The `AXNumericDataAxisDescriptor` formatting closure controls what's actually spoken for each y-value ("72 degrees" reads far better than "72.0"); always format with units.
- Keep `range` on `AXNumericDataAxisDescriptor` matched to the real data range (not artificially padded), since Audio Graph maps pitch to this range — an inflated range compresses all your data into a narrow pitch band and makes differences inaudible.

## VoiceOver navigation without a custom descriptor

If a chart is purely decorative (redundant with adjacent text, e.g. a sparkline next to an already-spoken numeric trend), suppress it from the accessibility tree instead of half-implementing a descriptor:

```swift
Chart(sample.trend) { point in
    LineMark(x: .value("Day", point.day), y: .value("Value", point.value))
}
.accessibilityHidden(true)
```

Do not use `accessibilityHidden` on a chart that is the primary way the data is presented — that removes the data entirely for VoiceOver users rather than making it navigable.

## Individual mark accessibility (supplementary, not a substitute)

Swift Charts does not expose distinct accessibility elements per rendered mark (bars/points aren't individually focusable outside of Audio Graph navigation). Do not try to attach `.accessibilityLabel`/`.accessibilityValue` to a single `BarMark`/`PointMark` expecting per-element VoiceOver focus — those modifiers apply to the mark's *drawing*, not to a focusable accessibility node, and are not a substitute for `AXChartDescriptor`. Where a specific data point matters standalone (e.g. "today" highlighted on a trend line), surface it as an adjacent SwiftUI `Text` view with its own accessibility traits, or as a `.annotation` whose content is a plain `Text` (annotations render as real views and inherit normal accessibility behavior):

```swift
RuleMark(x: .value("Today", today))
    .foregroundStyle(.clear)
    .annotation(position: .top) {
        Text("Today: \(todayValue, format: .number)")
            .accessibilityLabel("Today's value is \(todayValue.formatted())")
    }
```

## Switch Control

Switch Control relies on the same accessibility tree as VoiceOver, so a correctly implemented `AXChartDescriptor` is sufficient — no separate Switch Control-specific API exists for Swift Charts. Ensure any interactive selection UI built on `chartXSelection`/`chartYSelection` (see `charts.md`) has a non-gesture-only path: expose a segmented control, stepper, or list alongside the chart so a Switch Control or keyboard user can move the selection without needing to perform a drag gesture directly on the chart canvas.

## Checklist for agents reviewing chart code

1. Every `Chart`/`Chart3D` presenting non-decorative data has a matching `AXChartDescriptorRepresentable` and `.accessibilityChartDescriptor(_:)`.
2. Axis titles and the numeric formatting closure produce speakable, unit-bearing strings.
3. Multi-series charts declare one `AXDataSeriesDescriptor` per series with a name matching the visible legend.
4. Any custom interaction (selection, drill-down) has a non-gesture-dependent alternative control.
5. Purely decorative charts are explicitly `accessibilityHidden(true)`, not silently left undescribed.
