# RTL hierarchy import boundary

The editor imports an **elaborated hierarchy manifest**, not RTL source. SystemVerilog elaboration requires tool-specific preprocessing, parameter evaluation, generate expansion, and library resolution; the editor does not claim to perform those operations. A simulator, synthesis tool, or other EDA flow is responsible for producing resolved hierarchical paths before registration.

## Manifest input

Use one signal per line:

```text
<instance.path.signal> <kind>
```

Supported kinds are `binary`, `bus`, `state`, `logic`, `event`, `pulse`, and `clock`. A bus range is part of the final path segment, for example:

```text
soc.cpu.status binary
soc.cpu.address[31:0] bus
soc.pll.ref_clk clock
```

The current compact line format permits exactly two whitespace-separated fields, so the example should be written as `soc.cpu.status binary`; signal display labels are derived from the leaf name. Empty path components, malformed identifiers, unsupported kinds, bus ranges on non-bus signals, and buses without a range are rejected in Preview. Duplicate paths within the manifest or already present in the document are reported before Apply.

## Identity and registration

The manifest path is split into structured canonical fields:

- hierarchy prefix -> `source.instancePath`;
- leaf identifier without a packed range -> `source.signalName`;
- packed range -> `source.msb` and `source.lsb`;
- visible leaf label, including its range for buses -> signal display/name.

The selected presentation Group only determines where the new Signal is placed in the Timing Chart. It does not rewrite source identity. Preview supports path filtering and per-signal selection. Applying the selected set uses one `signal.bulkCreate` semantic command, producing one History operation. Save/Open uses the regular canonical document format; no import-only identity store is introduced.

This input is a hierarchy registration workflow only. VCD/FST/FSDB simulation waveform import and comparison are separate product work.
