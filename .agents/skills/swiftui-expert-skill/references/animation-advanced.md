# Advanced SwiftUI Animation

## `PhaseAnimator` — multi-step animation driven by an enum

`PhaseAnimator` cycles a view through a sequence of discrete "phases," animating between each in order, and looping (or stopping) automatically. It replaces manual chained `withAnimation` + `DispatchQueue.asyncAfter` sequencing — no timers, no completion-handler chains.

```swift
enum PulsePhase: CaseIterable {
    case initial, expand, contract

    var scale: CGFloat {
        switch self {
        case .initial: 1.0
        case .expand: 1.3
        case .contract: 0.95
        }
    }

    var opacity: Double {
        switch self {
        case .initial: 1.0
        case .expand: 0.6
        case .contract: 1.0
        }
    }
}

struct PulsingBadge: View {
    var body: some View {
        Circle()
            .fill(.red)
            .frame(width: 24, height: 24)
            .phaseAnimator(PulsePhase.allCases) { content, phase in
                content
                    .scaleEffect(phase.scale)
                    .opacity(phase.opacity)
            } animation: { phase in
                switch phase {
                case .initial: .smooth(duration: 0.2)
                case .expand: .easeOut(duration: 0.4)
                case .contract: .spring(duration: 0.3, bounce: 0.4)
                }
            }
    }
}
```

- `PhaseAnimator(PulsePhase.allCases)` iterates the array in order, then loops back to the first phase, repeating indefinitely as long as the view exists.
- The `animation` closure lets each phase transition use a different curve — the animation used to move *into* phase `X` is the one returned for `X`.
- The content closure receives the *current* phase, not the transition; drive every animatable property purely off `phase`, never off external `@State`, or the animator's internal timing and your own state can drift out of sync.

Trigger-based variant — animate once in response to an external event rather than looping forever — using the `trigger:` overload:

```swift
struct ShakeOnError: View {
    let errorCount: Int

    var body: some View {
        TextField("Password", text: .constant(""))
            .phaseAnimator(
                [0, -8, 8, -4, 0],
                trigger: errorCount
            ) { content, offset in
                content.offset(x: offset)
            } animation: { _ in
                .linear(duration: 0.06)
            }
    }
}
```

Each time `errorCount` changes, the phase sequence runs once end-to-end, then holds on the last phase until triggered again.

## `KeyframeAnimator` — fine-grained multi-track keyframes

`KeyframeAnimator` animates a single custom value type through independent keyframe tracks (position, scale, rotation, opacity, etc.), each with its own timing, driven by a `Keyframes` builder. Use it over `PhaseAnimator` when different properties need *independently timed* curves within the same overall animation, rather than all properties changing together at each phase boundary.

```swift
struct BounceValues {
    var scale = 1.0
    var verticalOffset = 0.0
    var rotation = Angle.zero
}

struct BouncingIcon: View {
    let trigger: Int

    var body: some View {
        Image(systemName: "star.fill")
            .foregroundStyle(.yellow)
            .keyframeAnimator(
                initialValue: BounceValues(),
                trigger: trigger
            ) { content, value in
                content
                    .scaleEffect(value.scale)
                    .offset(y: value.verticalOffset)
                    .rotationEffect(value.rotation)
            } keyframes: { _ in
                KeyframeTrack(\.scale) {
                    SpringKeyframe(1.4, duration: 0.15)
                    SpringKeyframe(0.9, duration: 0.2)
                    SpringKeyframe(1.0, duration: 0.15)
                }
                KeyframeTrack(\.verticalOffset) {
                    CubicKeyframe(-20, duration: 0.2)
                    CubicKeyframe(0, duration: 0.3)
                }
                KeyframeTrack(\.rotation) {
                    LinearKeyframe(.degrees(-15), duration: 0.1)
                    LinearKeyframe(.degrees(15), duration: 0.2)
                    LinearKeyframe(.zero, duration: 0.15)
                }
            }
    }
}
```

Keyframe kinds:
- `LinearKeyframe(value, duration:)` — constant-velocity interpolation to `value`.
- `CubicKeyframe(value, duration:)` — smoothed (Catmull-Rom-like) interpolation, considers neighboring keyframes for a natural curve.
- `SpringKeyframe(value, duration:, spring:)` — physically-simulated spring segment; ignores its own `duration` for actual settle time if the spring is still moving, but still reserves at least `duration` for other tracks to stay coordinated.

Each `KeyframeTrack` is independent — tracks are not required to have the same total duration, but for a single coherent gesture, sum each track's segment durations to the same overall duration so all properties settle together.

The `initialValue:` is the value at time zero of every run, and each keyframe is relative to the *previous keyframe's end value*, not the initial value — build the sequence as a chain, not as deltas from a fixed baseline.

## Custom `Animatable` conformance

Any value type you want SwiftUI to interpolate smoothly (rather than jump-cut) inside a `View`'s `body`/`Shape.path(in:)` must conform to `Animatable`, exposing an `animatableData` of a `VectorArithmetic`-conforming type.

```swift
struct Wave: Shape {
    var amplitude: CGFloat
    var phase: CGFloat

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(amplitude, phase) }
        set {
            amplitude = newValue.first
            phase = newValue.second
        }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 0, y: rect.midY))
        for x in stride(from: 0, through: rect.width, by: 1) {
            let relativeX = x / rect.width
            let y = rect.midY + amplitude * sin(relativeX * 2 * .pi + phase)
            path.addLine(to: CGPoint(x: x, y: y))
        }
        return path
    }
}
```

`Shape` already conforms to `Animatable` via `animatableData`; providing this property is what makes `.animation(_:value:)` or an enclosing `withAnimation` interpolate `amplitude` and `phase` frame-by-frame instead of snapping directly to the new shape.

## `AnimatableData` composition — nesting `AnimatablePair`

`AnimatablePair<First, Second>` composes two `VectorArithmetic` values into one. For three or more animatable scalars, nest pairs:

```swift
struct TriangleMorph: Shape {
    var topX: CGFloat
    var bottomLeftY: CGFloat
    var bottomRightY: CGFloat

    var animatableData: AnimatablePair<CGFloat, AnimatablePair<CGFloat, CGFloat>> {
        get { AnimatablePair(topX, AnimatablePair(bottomLeftY, bottomRightY)) }
        set {
            topX = newValue.first
            bottomLeftY = newValue.second.first
            bottomRightY = newValue.second.second
        }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: topX, y: 0))
        path.addLine(to: CGPoint(x: 0, y: bottomLeftY))
        path.addLine(to: CGPoint(x: rect.width, y: bottomRightY))
        path.closeSubpath()
        return path
    }
}
```

For more than three or four scalars, nested pairs become unreadable — define your own `VectorArithmetic`-conforming struct instead (implement `+`, `-`, `.zero`, and `scale(by:)`), which reads far more clearly than deeply nested `AnimatablePair`s.

## Animating `Path`/`Shape` morphing

Two shapes only morph smoothly (point-for-point interpolation) if their `path(in:)` produces the *same number and order* of path elements for every intermediate value — SwiftUI interpolates each numeric component of `animatableData`, not the geometric path itself. Morphing a triangle into a pentagon by literally changing point count will jump-cut; instead, parameterize a single shape definition (e.g. "polygon with `cornerCount: CGFloat` and `cornerRadius: CGFloat`") so the same code path draws every intermediate state.

```swift
struct RoundedPolygon: Shape {
    var sides: Double        // fractional sides interpolate mid-morph
    var cornerRadius: CGFloat

    var animatableData: AnimatablePair<Double, CGFloat> {
        get { AnimatablePair(sides, cornerRadius) }
        set {
            sides = newValue.first
            cornerRadius = newValue.second
        }
    }

    func path(in rect: CGRect) -> Path {
        // Build path using `sides` as a continuous parameter (e.g. via
        // interpolated vertex angles), not `Int(sides)`, so intermediate
        // frames render a smooth transitional polygon rather than snapping.
        Path(ellipseIn: rect) // Placeholder for the parameterized polygon construction.
    }
}
```

## `.symbolEffect()` variants for SF Symbols

```swift
Image(systemName: "bell.fill")
    .symbolEffect(.bounce, value: notificationCount)

Image(systemName: "wifi")
    .symbolEffect(.pulse, options: .repeating)

Image(systemName: "wifi", variableValue: signalStrength)
    .symbolEffect(.variableColor.iterative, options: .repeating)

Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
    .symbolEffect(.replace, options: .speed(1.5))
```

- `.bounce` — one-shot scale/translate bounce, typically tied to a `value:` trigger (fires once per change).
- `.pulse` — opacity pulse, usually with `.repeating` for an ongoing "waiting/active" indicator.
- `.variableColor` (with `.iterative` or `.cumulative`) — animates through a symbol's variable-color layers (e.g. Wi-Fi bars filling in sequence); requires a symbol that supports variable rendering.
- `.replace` — morphs from the old symbol to the new one via matched-layer draw-in/draw-out; use with `.contentTransition(.symbolEffect(.replace))` on `Image` when the symbol name itself changes (see `animation-transitions.md`), or directly with `.symbolEffect(.replace, value:)`.

`options:` (`.repeating`, `.speed(_:)`, `.nonRepeating`) tune all effect kinds uniformly.

## Coordinating multiple simultaneous animations without conflicts

Conflicts arise when two independent animation drivers touch the *same* animatable property (e.g. a gesture-driven `.offset` and a `PhaseAnimator`-driven `.offset` on the same view) — SwiftUI has no arbitration between them and the result is undefined/jittery. Rules of thumb:

1. **One state source per animatable property.** If a drag gesture owns `offset`, don't also drive `offset` from a `PhaseAnimator` on the same view; compose them on different properties (drag → `.offset`, phase animator → `.rotationEffect`) or funnel both into a single derived value.
2. **Isolate scopes with `.transaction`/nested `withAnimation`.** When one state mutation should animate two unrelated subtrees with different curves, apply per-subtree `.animation(_:value:)` rather than one global `withAnimation`, so each subtree's curve is independent and non-interfering.
3. **Let `matchedGeometryEffect` own layout, not manual offsets.** Combining a manual `.offset`/`.frame` animation with `matchedGeometryEffect` on the same view produces competing layout solutions; pick one mechanism per transition.
4. **Respect `@Environment(\.accessibilityReduceMotion)` centrally.** Gate all decorative/looping animators (`PhaseAnimator` loops, `.symbolEffect(.pulse, options: .repeating)`) behind a single check rather than scattering conditionals, so reduced motion mode can't leave one animator running while others stop, which itself looks like a bug.

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

var body: some View {
    Circle()
        .phaseAnimator(reduceMotion ? [PulsePhase.initial] : PulsePhase.allCases) { content, phase in
            content.scaleEffect(phase.scale)
        } animation: { _ in .smooth }
}
```
