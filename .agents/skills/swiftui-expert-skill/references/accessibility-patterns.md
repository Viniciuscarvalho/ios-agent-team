# SwiftUI Accessibility Patterns

## `.accessibilityLabel` / `.accessibilityValue` / `.accessibilityHint`

- **Label** — what the element *is*. Replaces the default (often unhelpful) label derived from image names or symbol names.
- **Value** — the element's current *state*, read after the label. Use for anything with a variable state (sliders, progress, toggles you've custom-built).
- **Hint** — what happens if the user *activates* the element. Read last, and only after a pause — keep it terse, and omit it for self-evident controls.

```swift
Button {
    toggleMute()
} label: {
    Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
}
.accessibilityLabel(isMuted ? "Muted" : "Unmuted")
.accessibilityHint("Double tap to \(isMuted ? "unmute" : "mute")")

Slider(value: $volume, in: 0...1)
    .accessibilityLabel("Volume")
    .accessibilityValue("\(Int(volume * 100)) percent")
```

Never concatenate the hint into the label — VoiceOver already announces the trait-derived action ("button," "adjustable") and appends the hint automatically after a configurable delay; duplicating that in the label creates redundant, verbose speech.

## `.accessibilityElement(children:)` — grouping compound views

By default, VoiceOver visits every subview with accessibility content as a separate stop. For a compound view that should read as *one* semantic unit (e.g. a list row with an icon, title, and subtitle), collapse it.

```swift
struct ContactRow: View {
    let contact: Contact

    var body: some View {
        HStack {
            AsyncImage(url: contact.avatarURL)
                .accessibilityHidden(true)
            VStack(alignment: .leading) {
                Text(contact.name)
                Text(contact.role)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(contact.name), \(contact.role)")
    }
}
```

`children:` modes:
- `.combine` — merges all descendant accessibility elements' labels/values into a single element, string-joined. Good default when you don't need to fully override the label.
- `.ignore` — descendants produce no accessibility content at all; you must supply `.accessibilityLabel`/`.accessibilityValue` explicitly on the parent, or VoiceOver announces nothing. Use when descendants are purely decorative or when the auto-combined string reads poorly and you want full control.
- `.contain` — descendants remain individually reachable as separate VoiceOver stops, but are now grouped as one *accessibility container* (relevant for rotor navigation and grouping semantics in table/outline-like UI), rather than collapsed into one stop.

Rule of thumb: `.combine` for simple label+value rows, `.ignore` + explicit label for anything where the auto-generated string would be wrong or where a custom control's internal decorative views (checkmarks, chevrons) shouldn't be individually announced, `.contain` when the group must stay one navigable container but children still need their own stops (e.g. a custom segmented control).

## `.accessibilityAddTraits` / `.accessibilityRemoveTraits`

Traits tell VoiceOver/Switch Control how to categorize and announce an element beyond its default (`Text` → static text, `Button` → button).

```swift
Text("New")
    .accessibilityAddTraits(.isHeader)

VStack {
    Text(article.title).font(.headline)
    Text(article.summary)
}
.accessibilityElement(children: .combine)
.accessibilityAddTraits(.isButton)
.onTapGesture { openArticle(article) }

Text(errorMessage)
    .accessibilityAddTraits(.isStaticText)
    .accessibilityRemoveTraits(.isButton)
```

Common traits: `.isHeader` (rotor "Headings" navigation), `.isButton`, `.isSelected`, `.isLink`, `.updatesFrequently` (tell VoiceOver a value changes often so it doesn't re-announce every micro-update, e.g. a live timer), `.playsSound`, `.startsMediaSession`.

Any view given a custom tap gesture instead of a native `Button` **must** get `.isButton` (or the appropriate trait) — SwiftUI does not infer interactivity from `.onTapGesture` alone, and VoiceOver users get no indication the element is actionable otherwise.

## Custom accessibility actions

`.accessibilityAction` exposes actions beyond a single primary tap — reachable via VoiceOver's actions rotor (swipe up/down while focused) rather than requiring a swipe gesture that assistive tech users can't discover or perform.

```swift
struct TaskRow: View {
    let task: Task
    let onComplete: () -> Void
    let onDelete: () -> Void
    let onSnooze: () -> Void

    var body: some View {
        HStack {
            Text(task.title)
            Spacer()
            if task.isComplete {
                Image(systemName: "checkmark.circle.fill")
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAction(.default) { onComplete() }
        .accessibilityAction(named: "Delete") { onDelete() }
        .accessibilityAction(named: "Snooze") { onSnooze() }
    }
}
```

`.accessibilityAction(.default)` overrides what happens on a VoiceOver double-tap (equivalent to the element's primary action). Named actions surface as additional rotor choices — this is the accessible equivalent of swipe actions on a `List` row, since swipe gestures alone are not reliably reachable with VoiceOver enabled.

For custom `.increment`/`.decrement` (e.g. a custom stepper-like control), use the dedicated adjustable traits:

```swift
Text("\(quantity)")
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Quantity")
    .accessibilityValue("\(quantity)")
    .accessibilityAdjustableAction { direction in
        switch direction {
        case .increment: quantity += 1
        case .decrement: quantity = max(0, quantity - 1)
        @unknown default: break
        }
    }
```

## Dynamic Type support

Prefer relative type styles (`.font(.body)`, `.font(.headline)`) over fixed point sizes so text scales with the user's preferred content size. Never clip scalable text with a fixed-height frame:

```swift
// Wrong: fixed height clips text at larger Dynamic Type sizes.
Text(title)
    .font(.body)
    .frame(height: 20)

// Right: let the frame grow with content; constrain width, not height.
Text(title)
    .font(.body)
    .frame(maxWidth: .infinity, alignment: .leading)
```

Cap runaway layouts (e.g. a horizontal button row that breaks at accessibility sizes) with `.dynamicTypeSize`, rather than fighting Dynamic Type globally:

```swift
HStack {
    Button("Cancel") { dismiss() }
    Button("Save") { save() }
}
.dynamicTypeSize(...DynamicTypeSize.accessibility1)
```

For layouts that must switch structure entirely at large sizes (e.g. HStack → VStack), read the environment and branch:

```swift
@Environment(\.dynamicTypeSize) private var dynamicTypeSize

var body: some View {
    if dynamicTypeSize.isAccessibilitySize {
        VStack(alignment: .leading) { content }
    } else {
        HStack { content }
    }
}
```

## `.accessibilityRepresentation` — substituting a simpler representation

Use when a custom, visually rich control (a hand-drawn chart, a custom gauge) has no meaningful one-to-one accessible mapping, and VoiceOver should instead interact with a synthetic, purpose-built stand-in view (commonly a `Slider` for adjustable custom controls).

```swift
struct CustomGauge: View {
    @Binding var value: Double

    var body: some View {
        GaugeShape(value: value)
            .accessibilityRepresentation {
                Slider(value: $value, in: 0...1) {
                    Text("Gauge value")
                }
            }
    }
}
```

VoiceOver users interact with the substituted `Slider` semantics (announcements, adjustable gestures) while sighted users see the custom-drawn gauge — the visual view itself contributes no accessibility content once a representation is supplied.

## Respecting `accessibilityReduceMotion` / `accessibilityReduceTransparency`

Any custom animation beyond simple crossfades, and any custom `.background(.ultraThinMaterial)`-style translucency, should branch on these environment values rather than assuming defaults.

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

var body: some View {
    Circle()
        .scaleEffect(isPulsing ? 1.2 : 1.0)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.6).repeatForever(), value: isPulsing)
}
```

```swift
@Environment(\.accessibilityReduceTransparency) private var reduceTransparency

var body: some View {
    content
        .background(
            reduceTransparency
                ? Color(.systemBackground)
                : Color(.systemBackground).opacity(0.8)
        )
        .background(reduceTransparency ? nil : .ultraThinMaterial)
}
```

Reduce Motion does not disable animation entirely by policy — it's a signal to avoid large, sweeping, parallax, or vestibular-triggering motion. Crossfades and small opacity changes are generally fine to keep; large translations, 3D rotations, and continuous looping motion should be swapped for a static or fade-based alternative, as in the `PivotTransition` reduced-motion branch shown in `animation-transitions.md`.

## Color contrast, `accessibilityInvertColors`, increased contrast

Never encode meaning by color alone (e.g. red/green status dots with no label) — pair color with a shape, icon, or text label so `accessibilityInvertColors` and colorblind users retain the information.

```swift
Label("Connected", systemImage: "checkmark.circle.fill")
    .foregroundStyle(.green)
    .symbolRenderingMode(.hierarchical)
```

Prefer semantic system colors (`Color.primary`, `Color(.systemBackground)`, `Color.accentColor`) over hardcoded hex values — these automatically satisfy contrast requirements across light/dark mode and respond to Increased Contrast without extra code. To react to Increased Contrast explicitly (e.g. to thicken a custom border rather than relying on color alone):

```swift
@Environment(\.colorSchemeContrast) private var contrast

var body: some View {
    RoundedRectangle(cornerRadius: 8)
        .strokeBorder(Color.primary, lineWidth: contrast == .increased ? 2 : 1)
}
```

`accessibilityInvertColors` itself is handled by the system compositor for standard SwiftUI views/colors automatically — the main risk is custom `Image`/photographic content, which should generally be excluded from inversion:

```swift
Image("productPhoto")
    .accessibilityInvertColors(false)
```

## VoiceOver testing workflow

1. Enable VoiceOver on-device or Simulator (Settings → Accessibility → VoiceOver, or triple-click the side button if configured as the accessibility shortcut).
2. Swipe right/left to move between elements in traversal order; verify order matches visual reading order — reorder with `.accessibilitySortPriority` if not.
3. Swipe up/down while focused on an element to cycle its custom actions rotor; verify every interactive affordance (delete, snooze, etc.) is reachable without a gesture.
4. Two-finger rotor gesture ("rotor") to jump by Headings/Links/Form Controls; verify `.isHeader` traits are applied where expected.
5. Double-tap to activate; confirm the announced label, value, and hint match intent and aren't redundant or empty.
6. Test with larger Dynamic Type sizes simultaneously (Settings → Accessibility → Display & Text Size) — VoiceOver users frequently also use larger text sizes, and layouts that clip or truncate under combined settings are a common regression source.

## Accessibility Inspector

Xcode → Open Developer Tool → Accessibility Inspector. Point it at a running Simulator or connected device to:
- Inspect the accessibility tree for any on-screen element (label, value, traits, hint, frame) without enabling VoiceOver.
- Run the built-in **Audit** tab for automated checks (contrast, missing labels, hit-target size, element description clarity) across the current screen.
- Simulate VoiceOver-style focus navigation directly from the Inspector without a physical accessibility gesture, useful for rapid iteration while developing.

Run an Inspector audit before every non-trivial UI PR touching custom controls, images, or gesture-only interactions — it catches missing labels and undersized hit targets far faster than manual VoiceOver navigation.
