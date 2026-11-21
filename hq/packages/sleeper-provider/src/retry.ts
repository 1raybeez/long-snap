import type { SleeperRetryPolicy } from "./types.ts";

export const DEFAULT_RETRY_POLICY: SleeperRetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
  retryableStatusCodes: [408, 425, 429, 500, 502, 503, 504],
};

export function getRetryDelay(policy: SleeperRetryPolicy, retryNumber: number): number {
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * (2 ** Math.max(0, retryNumber - 1)));
}
