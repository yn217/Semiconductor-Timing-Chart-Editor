import type { CommandId } from "@timing-chart-v2/schema";

let commandSequence = 0;

export function nextCommandId(scope: string): CommandId {
  commandSequence += 1;
  return `cmd_phase7_${scope}_${commandSequence}` as CommandId;
}
