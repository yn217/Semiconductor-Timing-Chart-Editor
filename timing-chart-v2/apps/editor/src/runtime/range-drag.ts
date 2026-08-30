export type RangeDragState = {
  readonly start: number;
  readonly anchor: number;
  readonly selectedCycle: number;
  readonly startClientX: number;
  readonly surface: "ruler" | "waveform";
  moved: boolean;
};

export class RangeDragController {
  private state: RangeDragState | undefined;

  get current(): RangeDragState | undefined { return this.state; }
  begin(state: RangeDragState): void { this.state = state; }
  markMoved(): void { if (this.state) this.state.moved = true; }
  clear(): void { this.state = undefined; }
}
