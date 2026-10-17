/// <reference lib="webworker" />
/**
 * Runs the Monte Carlo engine off the main thread. The engine itself (Agent 2) is unchanged;
 * this worker only hosts it. Progress/cancellation hooks are an open contract item, so
 * cancellation is done by terminating the worker.
 */
import { runMonteCarlo, type MonteCarloInput } from '@/contracts';

self.onmessage = (e: MessageEvent<{ id: number; input: MonteCarloInput }>) => {
  const { id, input } = e.data;
  const started = performance.now();
  const result = runMonteCarlo(input);
  self.postMessage({ id, result, ms: performance.now() - started });
};
