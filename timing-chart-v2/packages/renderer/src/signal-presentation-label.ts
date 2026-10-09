import type { RowLayoutEntry } from "@timing-chart-v2/projection";

export function signalTypeLabel(type: string | undefined): string {
  if (type === "clock") return "Clock";
  if (type === "commentRow") return "Comment";
  if (type === "pulse") return "Pulse";
  if (type === "binary") return "Signal";
  if (type === "bus") return "Bus";
  if (type === "state") return "State";
  if (type === "logic") return "Level";
  if (type === "event") return "Event";
  return type ?? "Signal";
}

export function signalPresentationLabel(kind: RowLayoutEntry["kind"], role: RowLayoutEntry["role"], signalType: string | undefined): string {
  if (kind === "comment") return "";
  if (signalType === undefined || signalType === "binary") return role === "input" ? "i" : role === "output" ? "o" : "wire";
  return signalTypeLabel(signalType);
}
