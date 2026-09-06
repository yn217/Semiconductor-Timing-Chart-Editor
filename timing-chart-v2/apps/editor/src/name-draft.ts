/** An uncommitted name belongs to one canonical entity snapshot. */
export interface NameDraft {
  readonly target: object | undefined;
  readonly base: string;
  readonly value: string;
  readonly error: string;
}

export function reconcileNameDraft(draft: NameDraft, target: object | undefined, value: string): NameDraft {
  return draft.target === target && draft.base === value
    ? draft
    : { target, base: value, value, error: "" };
}
