import type { GroupId, SignalId, SignalRole, ValueSignal } from "@timing-chart-v2/schema";
export const signalId = (value: string) => value as SignalId;
export const groupId = (value: string) => value as GroupId;
export function valueSignal(id: string, name: string, role: SignalRole, values: ValueSignal["values"], options: Pick<ValueSignal, "type" | "width" | "displayFormat"> = { type: "binary" }): ValueSignal { return { id: signalId(id), name, role, type: options.type, source: { instancePath: ["dut"], signalName: name.toLowerCase() }, display: { name }, values, ...(options.width === undefined ? {} : { width: options.width }), ...(options.displayFormat === undefined ? {} : { displayFormat: options.displayFormat }) }; }

