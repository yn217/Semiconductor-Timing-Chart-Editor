# WaveDrom Exhaustive Conformance Harness

## Purpose
Verify that every cycle-level signal shape emitted by this application is the same shape WaveDrom would emit for the equivalent WaveJSON.

WaveDrom source code/skins do **not** need to be vendored into this repository. Use a pinned npm dependency and its default skin at test/runtime.

## Two independent test paths

### Reference path
```text
Canonical WaveJSON fixture
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

Tests compare both the generated WaveJSON and the rendered SVG waveform layer.

This catches:
- wrong semantic-to-WaveJSON conversion
- wrong continuation/gap insertion
- wrong period/phase conversion
- accidental post-processing that changes WaveDrom geometry
- custom fallback trace geometry being used instead of WaveDrom

## Version rule
- Pin the WaveDrom npm version in package.json/package-lock.
- Record the pinned version in test output.
- A WaveDrom version update is a reviewed compatibility change.
- Do not silently update Golden expectations when the dependency changes.

## Coverage definition: `all WaveDrom signal drawing`
For the pinned version, the conformance generator must exercise every supported waveform primitive and every reachable transition between primitives, not only a hand-picked screenshot set.

At minimum include the WaveJSON signal symbols documented/supported by the pinned renderer, including:
- binary low/high
- X / undefined
- Z / high impedance
- weak pull-up / pull-down
- data/bus color states
- continuation
- gap
- positive/negative clock
- clock-with-active-edge marker variants

Do not rely only on a manually hard-coded subset. Keep a small explicit token manifest for review, but also validate it against the capabilities/fixtures of the pinned WaveDrom version so a newly supported primitive cannot be missed silently.

## Exhaustive matrices

### A. Single-state primitives
Render each supported primitive alone and with continuation.

### B. Ordered state-transition matrix
For all non-clock drawable states `A` and `B`, render every ordered pair:

```text
A -> B
```

This includes same-state, binary, X/Z, weak and data/bus transitions where legal.
Unsupported combinations must be explicitly classified; they must not be silently skipped.

### C. Clock matrix
Render all supported clock variants with:
- positive/negative polarity
- active-edge marker variants
- continuation
- transitions into/out of static low/high where WaveDrom supports them
- mixed clock/static segments used to represent gating

### D. Bus/data matrix
Render every supported bus/data color/state and every pairwise transition between bus/data states, including labels.

### E. Timing transforms
Exercise at least:
- period 1, 2, 3, 4
- phase -0.5, 0, +0.5, +1 where accepted by the pinned renderer
- hscale/reference horizontal scale values used by the application
- combinations of period + phase

### F. Gap / spacer / grouping interactions
Verify signal geometry adjacent to:
- timeline gap
- empty spacer lane
- groups/nested groups where supported

These are primarily layout tests, but they must not alter the signal trace itself unexpectedly.

## Comparison levels

### 1. WaveJSON equivalence
The adapter-generated temporary WaveJSON must equal the expected canonical WaveJSON after normalization of irrelevant object ordering/defaults.

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

Ignore only unstable, non-visual identifiers such as generated DOM IDs when necessary.

Default coordinate tolerance: **0 px**.

### 3. Raster diagnostic artifact
On failure, optionally rasterize Reference SVG and DUT SVG and emit:
- reference.png
- dut.png
- diff.png

Raster diff is diagnostic. SVG/path equality is the normative waveform acceptance test.

## CI behavior
The conformance suite must:
1. generate Reference SVGs at test time using the pinned WaveDrom dependency;
2. generate DUT output through the application adapter/renderer path;
3. compare all cases;
4. report total/covered/unsupported/failed combinations;
5. attach mismatched SVGs and optional image diffs as CI artifacts.

Reference SVG files do not need to be committed to Git.

## No tautological bypass
The fact that both paths eventually invoke WaveDrom does not remove the value of the test: the Reference path receives canonical WaveJSON directly, while the DUT path must pass through our semantic model, adapter, production composition and extraction layers.

Tests must additionally assert that the DUT waveform elements originate from the WaveDrom-rendered subtree and that no custom fallback path replaced the trace geometry.

## Acceptance
- 100% of supported generated cases pass.
- Every skipped/unsupported case has an explicit reason.
- 0 px default geometry difference.
- Any WaveDrom dependency update reruns the entire matrix and requires review of any changed result.
