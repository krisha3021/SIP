/// <reference lib="webworker" />
/**
 * Hosts Agent 2's chunked Monte Carlo engine off the main thread. Results are identical to
 * `runMonteCarlo`; this worker only relays progress and honours cancellation via AbortSignal.
 *
 * Messages in:  { type: 'run', id, input } | { type: 'cancel', id }
 * Messages out: { type: 'progress', id, done, total } | { type: 'result', id, result, ms }
 */
import { runMonteCarloChunked, type MonteCarloInput } from '@/contracts';

type InMsg = { type: 'run'; id: number; input: MonteCarloInput } | { type: 'cancel'; id: number };

const controllers = new Map<number, AbortController>();

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    controllers.get(msg.id)?.abort();
    return;
  }
  // Only one run at a time: a new run cancels any earlier one.
  for (const c of controllers.values()) c.abort();
  const ctrl = new AbortController();
  controllers.set(msg.id, ctrl);
  const started = performance.now();
  const result = await runMonteCarloChunked(msg.input, {
    signal: ctrl.signal,
    onProgress: (done, total) => self.postMessage({ type: 'progress', id: msg.id, done, total }),
  });
  controllers.delete(msg.id);
  self.postMessage({ type: 'result', id: msg.id, result, ms: performance.now() - started });
};
