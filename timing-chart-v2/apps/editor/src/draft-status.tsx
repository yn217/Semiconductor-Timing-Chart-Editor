/** Shared Bottom/Inspector draft state indicator (#426). */
export function DraftStatus({ testId, label = "Unapplied changes" }: { readonly testId: string; readonly label?: string }) {
  return <output className="draft-unapplied-indicator" data-testid={testId} role="status">● {label}</output>;
}
