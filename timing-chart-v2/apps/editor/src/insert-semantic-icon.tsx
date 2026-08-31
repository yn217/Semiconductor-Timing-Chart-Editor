export type InsertSemanticIconKind = "clock" | "state" | "event" | "pulse" | "text";

export function InsertSemanticIcon({ kind }: { readonly kind: InsertSemanticIconKind }) {
  const paths: Record<InsertSemanticIconKind, readonly string[]> = {
    clock: ["M2 7h4v10h4V7h4v10h4V7h4"],
    state: ["M2 7h6v10H2z", "M8 7h6v10H8z", "M14 7h8v10h-8z"],
    event: ["M12 3v18", "m12 7 5 5-5 5-5-5z"],
    pulse: ["M2 15h5l2-8 3 10 2-6 2 4h6"],
    text: ["M4 5h12M10 5v14M6 19h8", "M17 8h5M17 12h5M17 16h5"],
  };
  return <svg aria-hidden="true" data-insert-icon={kind} viewBox="0 0 24 24" width="18" height="18" focusable="false">{paths[kind].map((path) => <path key={path} d={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />)}</svg>;
}
