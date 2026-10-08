/** Shared, selection-independent result channel; never changes document state. */
export function OperationFeedback({ error, message, onShowProblems }: {
  readonly error: string;
  readonly message: string;
  readonly onShowProblems: () => void;
}) {
  const text = error || message;
  if (!text) return null;
  return <aside className="operation-feedback" data-testid="operation-feedback" data-kind={error ? "error" : "success"}>
    <p role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>{text}</p>
    {error && <button type="button" onClick={onShowProblems}>Open Problems</button>}
  </aside>;
}
