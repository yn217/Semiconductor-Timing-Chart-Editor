# WaveDrom Exhaustive Conformance Harness

## Purpose
Verify that every cycle-level signal shape emitted by this application is the same shape WaveDrom would emit for the equivalent WaveJSON.

WaveDrom source code/skins do **not** need to be vendored into this repository. Use one pinned npm dependency and its default skin at test/runtime.

## Two independent test paths

### Reference path
```text
Independently-authored Canonical WaveJSON fixture
  -> pinned WaveDrom package directly
  -> default skin
  -> Reference SVG
```

### DUT path
```text
Semantic `.tcd` fixture
  -> our WaveDrom Adapter
  -> generated temporary WaveJSON
  -> production WaveDrom renderer/default skin
  -> Application SVG waveform layer
```

Tests compare both generated WaveJSON and rendered SVG waveform layer.

This catches:
- wrong semantic-to-WaveJSON conversion
- wrong continuation/gap insertion
- wrong period/phase conversion
- accidental post-processing that changes WaveDrom geometry
- custom fallback trace geometry being used instead of WaveDrom

## Version rule
- Pin the WaveDrom npm version in package.json/package-lock.
- Browser runtime and conformance tests must use that same pinned package version.
- Record the pinned version in test output.
- A WaveDrom version update is a reviewed compatibility change.
- Do not silently update Golden expectations when the dependency changes.
- Do not maintain a second manually-copied WaveDrom source/skin as another source of truth.

## Critical semantic rule: implicit continuation
The `.tcd` semantic model stores change points, not WaveDrom continuation characters.

Example:
```json
[{"start":0,"value":0},{"start":3,"value":1},{"start":7,"value":0}]
```
For a 10-cycle view the Adapter MUST materialize:
```text
0..1...0..
```
not:
```text
0001111000
```

For bus/state change points:
```json
[{"start":0,"value":"IDLE"},{"start":3,"value":"0x1000"},{"start":7,"value":"IDLE"}]
```
canonical output must use a data token only at each change point and `.` between them, e.g.:
```text
wave: =..=...=..
data: ["IDLE", "0x1000", "IDLE"]
```

Therefore continuation is a **supported mandatory adapter behavior**. It may not be listed as unsupported merely because `.tcd` does not explicitly store `.`.

## Coverage definition: all supported WaveDrom signal drawing
For the pinned version, the conformance generator must exercise every supported waveform primitive and every reachable transition between primitives, not only a hand-picked screenshot set.

At minimum include:
- binary low/high
- X / undefined
- Z / high impedance
- weak pull-up / pull-down
- data/bus color states
- continuation
- gap
- positive/negative clock
- clock-with-active-edge marker variants where supported

Do not rely only on a manually hard-coded subset. Keep an explicit token manifest for review and validate it against the pinned WaveDrom capability set/fixtures where practical.

## Exhaustive matrices

### A. Single-state primitives
Render each supported primitive alone and held across multiple cycles.

### B. Ordered state-transition matrix
For all non-clock drawable states `A` and `B`, render every ordered pair:
```text
A -> B
```

### C. Persistence matrix
For each legal state/transition family, include multiple hold lengths. At minimum:
```text
A -> B
A. -> B
A... -> B
A....... -> B
A -> B...
0...1...0...
X...1...Z...
```

For bus/state, include long held values and verify only change points consume `data` entries.

### D. Clock matrix
Render all supported clock variants with:
- positive/negative polarity
- active-edge marker variants where supported
- continuation
- transitions into/out of static low/high where WaveDrom supports them
- mixed clock/static segments used to represent gating where supported

### E. Bus/data matrix
Render every supported bus/data color/state and pairwise transition, including labels and persistence lengths.

### F. Timing transforms
Exercise at least:
- period 1, 2, 3, 4
- phase -0.5, 0, +0.5, +1 where accepted
- hscale/reference horizontal scale values used by the application
- combinations of period + phase

### G. Gap / spacer / grouping interactions
Verify signal geometry adjacent to timeline gap, empty spacer lane and groups/nested groups where supported. These are mainly layout tests but must not alter trace geometry unexpectedly.

## Independent expected values
Expected WaveJSON must not be produced by calling or partially reusing the DUT adapter algorithm.

Mandatory explicit expected fixtures include:
```text
0..1...0..
=..=...=..
```
with bus `data` arrays containing semantic values only at change points.

Tests that assert held binary output is `0011` or held bus output is `====` are invalid if those characters represent repeated redraw rather than semantic change points.

## Comparison levels

### 1. WaveJSON equivalence
Adapter-generated temporary WaveJSON must equal independently-authored canonical WaveJSON after normalization of irrelevant object ordering/defaults.

### 2. SVG semantic/geometry equivalence
Compare normalized waveform SVG elements:
- path `d`
- polyline/polygon points
- transforms
- x/y/width/height
- stroke width
- linecap / linejoin
- relevant classes/styles
- text position for bus/data labels where WaveDrom owns that text

Ignore only unstable non-visual identifiers when necessary.

Default coordinate tolerance: **0 px**.

### 3. Raster diagnostic artifact
On failure, optionally rasterize Reference SVG and DUT SVG and emit reference.png, dut.png and diff.png. Raster diff is diagnostic; SVG/path equality is normative for WaveDrom trace geometry.

## CI behavior
The suite must:
1. generate Reference SVG at test time using the pinned WaveDrom dependency;
2. generate DUT output through semantic model -> adapter -> production composition;
3. compare all cases;
4. report total/covered/unsupported/failed combinations;
5. attach mismatched SVGs and optional image diffs as CI artifacts.

Reference SVG files do not need to be committed to Git.

## No tautological bypass
Both paths may ultimately invoke WaveDrom, but Reference receives canonical WaveJSON directly while DUT passes through our semantic model, Adapter, production composition and extraction layers.

Tests must assert DUT waveform elements originate from the WaveDrom-rendered subtree and that no custom `pathFor()`/fallback trace generator replaced the signal geometry.

## Clock Edge Counter overlay conformance
Clock Edge Counter labels are custom overlays and excluded from raw WaveDrom trace-shape equality, but their anchor positions must derive from the same rendered Geometry Map.

Required checks:
- `rising`: each event corresponds to an actual WaveDrom rising-edge Geometry anchor.
- `falling`: each event corresponds to an actual WaveDrom falling-edge Geometry anchor.
- `both`: rising/falling anchors merge chronologically into one sequence.
- multiple Clock signals keep independent counters.
- gated/static intervals contribute no nonexistent edge count.
- `labelEvery=N` suppresses labels only; internal selected-edge index still increments.
- `startNumber` changes numbering only, not edge selection.
- `countFrom` changes the semantic starting anchor without shifting WaveDrom edge positions.
- Above/Below and X/Y offsets are relative to exact Geometry Map anchors.

Forbidden: deriving overlay x-position from a separate `cycle * pixelsPerCycle` formula when rendered Geometry exists.

## Acceptance
- 100% of supported generated cases pass.
- Every skipped/unsupported case has an explicit reason.
- Continuation/persistence is covered and is not skipped.
- Held bus/data values do not create per-cycle data cells/labels.
- 0 px default WaveDrom geometry difference.
- Any dependency update reruns the entire matrix and requires review.
- Clock Edge Counter anchor alignment passes for Rising/Falling/Both, multiple clocks, gating and labelEvery.
