# V2 ValueSignal render policy

The supported production profile uses the following canonical domains:

| Type | WaveDrom domain | Accepted values | Semantics |
| --- | --- | --- | --- |
| Binary | logic | `0`, `1`, `x`, `z` and the documented aliases | Two-level signal with unknown/high-impedance states |
| Logic | logic | `0`, `1`, `x`, `z`, `d`, `u` and aliases | Four-state plus weak-drive logic level |
| Event | data | Non-empty event marker such as `none`, `rise`, or `fall` | The data value identifies the event occurrence |
| Pulse | logic | Logic domain | Pulse width is represented by transitions |
| Bus | data | Non-empty string or number, subject to width/literal validation | WaveDrom data entry |
| State | data | Non-empty string or number | Symbolic or numeric WaveDrom data entry |

`packages/schema/src/value-signal-compatibility.ts` is the single policy owner.
Schema/Open validation, SemanticCommand planning, Quick Values, and the
WaveDrom adapter all consume this policy. A ValueSignal type conversion keeps
the stable signal ID, group/order, source hierarchy, and values; it is rejected
when the existing values are not valid in the target domain. There is no silent
coercion or renderer fallback. Applying a valid conversion remains one
SemanticCommand and one history entry, while a rejected conversion leaves the
canonical document unchanged.

The conversion rule is therefore:

| Source values | Target logic | Target data |
| --- | --- | --- |
| logic-domain values | allowed only when every value is in the target type's domain | allowed |
| data-domain values | rejected unless an explicit future conversion command is added | allowed |
