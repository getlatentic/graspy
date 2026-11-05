/** Items pushed from callbacks, read as an async generator. An end with a failure is thrown to the
 * reader after the items before it. */
export class Queue<T> {
  private items: T[] = [];
  private closed = false;
  private failure: Error | undefined;
  private wake: (() => void) | null = null;

  push(item: T): void {
    if (this.closed) return;
    this.items.push(item);
    this.notify();
  }

  end(failure?: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.failure = failure;
    this.notify();
  }

  async *drain(): AsyncGenerator<T> {
    for (;;) {
      const item = this.items.shift();
      if (item !== undefined) {
        yield item;
        continue;
      }
      if (this.closed) {
        if (this.failure) throw this.failure;
        return;
      }
      await new Promise<void>((resolve) => (this.wake = resolve));
    }
  }

  private notify(): void {
    this.wake?.();
    this.wake = null;
  }
}
