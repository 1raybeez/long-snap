import type { SleeperEndpoint, SleeperErrorCode, SleeperProviderError } from "./types.ts";

export function isRetryableStatus(statusCode: number, retryableStatusCodes: readonly number[]): boolean {
  return retryableStatusCodes.includes(statusCode);
}

export function providerError(
  code: SleeperErrorCode,
  endpoint: SleeperEndpoint,
  message: string,
  retryable: boolean,
  statusCode?: number,
): SleeperProviderError {
  return { code, endpoint, message, retryable, ...(statusCode === undefined ? {} : { statusCode }) };
}
