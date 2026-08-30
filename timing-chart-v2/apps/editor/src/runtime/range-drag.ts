export type RangeDragState = {
  readonly start: number;
  readonly anchor: number;
  readonly selectedCycle: number;
  readonly startClientX: number;
  readonly surface: "ruler" | "waveform";
  moved: boolean;
};
