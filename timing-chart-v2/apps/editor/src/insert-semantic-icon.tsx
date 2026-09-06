export type InsertSemanticIconKind = "signal" | "clock" | "bus" | "state" | "logic" | "event" | "pulse" | "marker" | "range" | "measurement" | "highlight" | "bracket" | "verticalLine" | "dependency" | "text";

export function InsertSemanticIcon({ kind }: { readonly kind: InsertSemanticIconKind }) {
  const paths: Record<InsertSemanticIconKind, readonly string[]> = {
    signal: ["M2 15h5l2-7 3 9 2-5 2 3h6"],
    clock: ["M2 7h4v10h4V7h4v10h4V7h4"],
    bus: ["M2 8h20M2 12h20M2 16h20", "M5 5v14M19 5v14"],
    state: ["M2 7h6v10H2z", "M8 7h6v10H8z", "M14 7h8v10h-8z"],
    // #400: Level (canonical type `logic`) -- a held level plateau (not a
    // multi-transition waveform like `signal`) with a small up-chevron
    // above its rising edge and a down-chevron below its falling edge,
    // evoking the weak pull-up (U) / pull-down (D) drive states Level
    // adds on top of 0/1/X/Z, distinct from `state`'s stacked-block glyph.
    logic: ["M2 18h4v-10h12v10h4", "M8 6V1M6 3l2-2 2 2", "M16 20v3M14 21l2 2 2-2"],
    event: ["M12 3v18", "m12 7 5 5-5 5-5-5z"],
    pulse: ["M2 15h5l2-8 3 10 2-6 2 4h6"],
    marker: ["M12 21 5 14a7 7 0 1 1 14 0z", "M12 7v7"],
    range: ["M4 6v12M20 6v12", "M4 12h16"],
    measurement: ["M4 18 20 6", "M7 16l-2 2M11 13l-2 2M15 10l-2 2M19 7l-2 2"],
    highlight: ["M4 6h16v12H4z", "M6 15h12"],
    bracket: ["M8 4H5v16h3M16 4h3v16h-3"],
    verticalLine: ["M12 3v18", "M8 6h8M8 18h8"],
    dependency: ["M4 12h16", "m15 7 5 5-5 5", "M4 7v10"],
    text: ["M4 5h12M10 5v14M6 19h8", "M17 8h5M17 12h5M17 16h5"],
  };
  return <svg aria-hidden="true" data-insert-icon={kind} viewBox="0 0 24 24" width="18" height="18" focusable="false">{paths[kind].map((path) => <path key={path} d={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />)}</svg>;
}
