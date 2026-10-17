/**
 * In-flight request de-duplication: concurrent callers asking for the same key share one promise,
 * so a burst of page views triggers a single upstream request. The entry is removed when the
 * promise settles, so a failure is never cached by this layer.
 */
export class RequestDeduper {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const p = (async () => {
      try {
        return await fn();
      } finally {
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, p);
    return p;
  }

  get pending(): number {
    return this.inFlight.size;
  }
}
