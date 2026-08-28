# WaveDrom Compatibility / Difference Specification

## 0. Normative rule
Cycle-level signal traces must preserve **actual WaveDrom waveform geometry**.

For the MVP, use the WaveDrom renderer/default skin directly for the waveform trace layer. A custom renderer that merely resembles WaveDrom is not acceptable.

WaveDrom source code and skin files do **not** need to be copied/vendored into this repository. Use a pinned package dependency and record the version in the lockfile/test report.

Only the following layers may be custom around it:
- semantic model / editor
- signal role/name columns
- group backgrounds
- selection/hover
- annotation overlay
- transaction overlay/view
- document header/footer/layout

## 1. Required rendering pipeline

```text
Semantic Timing Model
    ↓
WaveDrom Adapter
    ↓
Temporary WaveJSON
    ↓
WaveDrom Renderer + default skin
    ↓
Waveform SVG
    ↓
Geometry Map extraction
    ↓
Custom Overlay (annotation/selection/group UI)
```

Temporary WaveJSON is internal only and must not become the canonical saved model.

## 2. Preserve / implement
- Low `0`
- High `1`
- X / undefined
- Z / high impedance
- weak high / low where supported by WaveDrom
- Bus/Data waveform + text
- positive/negative clocks
- clock active-edge marker where applicable
- period / phase including 0.5 phase
- gating-equivalent mixed clock/static intervals
- gap `|`
- spacers/groups as appropriate
- node/edge semantics via our semantic anchors / Transition Arrow GUI
- WaveDrom edge line styles where applicable

## 3. Replace input syntax only
WaveDrom visual semantics are retained while authoring syntax is replaced.

- `wave: "0...1..0"` -> Semantic `start/value`
- `.` -> automatic continuation
- `node: "...a..b"` -> semantic waveform geometry anchor
- `edge: "a->b"` -> GUI Transition Arrow
- `period/phase` -> Signal/Clock Properties GUI
- group arrays -> Signal Tree GUI
- `|` gap -> Timeline Gap GUI
- `hscale` -> Time Scale / Zoom GUI
- head/foot -> Document Layout

## 4. Forbidden custom approximations
Do not independently generate the following trace geometry with hand-written SVG paths/CSS if WaveDrom is the active renderer:

- binary 0→1 transition
- binary 1→0 transition
- bus/data transition polygon
- X transition
- Z transition
- clock pulse geometry
- positive/negative clock edge brick
- gap geometry

In particular, a simple vertical digital step such as:

```text
____|‾‾‾‾
```

is not an acceptable replacement for a WaveDrom default-skin transition when WaveDrom uses its transition brick geometry.

## 5. Exhaustive WaveDrom conformance
Do not verify only a few manually selected waveforms.

The full requirements are defined in `docs/WAVEDROM_CONFORMANCE.md`.

At test time create two paths:

```text
Reference:
Canonical WaveJSON -> pinned WaveDrom/default skin -> Reference SVG

DUT:
Semantic .tcd -> our Adapter -> temporary WaveJSON
 -> production WaveDrom/default skin -> DUT waveform SVG
```

Then compare:
1. generated WaveJSON against canonical WaveJSON;
2. normalized SVG waveform geometry against Reference SVG.

Generate coverage for **every supported WaveDrom signal primitive and every reachable ordered transition** for the pinned version, plus clocks, bus/data states, period/phase, gap and relevant layout interactions.

Reference SVGs are generated during CI and do not need to be stored in Git.

Default geometry tolerance: **0 px**.
Every unsupported/skipped combination requires an explicit reason.

## 6. Geometry Golden requirements
For equivalent WaveJSON input, compare the generated waveform layer with WaveDrom reference output.

Comparison shall include normalized:
- SVG path `d`
- polyline/polygon points
- element transforms
- lane/brick dimensions
- transition endpoints
- stroke width
- linecap / linejoin where visually relevant
- relevant text position when WaveDrom owns bus/data text

If normalization requires a non-zero exception, it must be documented per test and must not hide a visible shape difference.

## 7. Geometry Map
After WaveDrom renders, extract actual rendered positions for semantic use.

Required anchors:
- cycle start / center / end
- value start
- transition start / center / end where meaningful
- rising edge
- falling edge
- bus transition

Annotation/Transition Arrow code must consume this Geometry Map.
It must not use an independently estimated `cycle * pixelsPerCycle` coordinate when an exact rendered anchor is available.

## 8. Signal labels and roles
Our GUI owns signal label/role columns.

Do not place strings such as:
- `i req_valid`
- `wire busy`
- `o ready`

inside the waveform trace region as a substitute for the dedicated role/name columns.

WaveDrom-generated labels may be hidden/cropped/replaced only in a way that does **not** modify the waveform trace geometry.

## 9. Acceptance rule
A screenshot that is semantically correct but visibly different from WaveDrom signal shapes is a FAIL.

A renderer shall not be accepted merely because:
- timing values are correct
- edges occur at the correct cycle
- the waveform looks like a normal digital waveform

The geometry itself must match WaveDrom.

## 10. Future independent renderer
A fully independent renderer may be considered later only if it passes the same exhaustive SVG-geometry conformance suite against WaveDrom. Until then, WaveDrom remains the waveform visual source of truth.
