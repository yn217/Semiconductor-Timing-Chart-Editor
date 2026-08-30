/** Owns the document-scoped epoch used to reject stale async/gesture work. */
export class DocumentEpoch {
  private value = 0;

  current(): number {
    return this.value;
  }

  advance(): number {
    this.value += 1;
    return this.value;
  }

  isCurrent(epoch: number): boolean {
    return epoch === this.value;
  }
}
