/**
 * Structured data-layer errors. API routes map these to HTTP responses; the UI shows `message`.
 * Messages never include secrets, upstream response bodies, or stack traces.
 */
import { UpstreamError } from './mfapi';

export type DataErrorCode =
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_HTTP'
  | 'INVALID_PAYLOAD'
  | 'CANCELLED'
  | 'INTERNAL';

export interface DataError {
  code: DataErrorCode;
  message: string;
  /** True when retrying later may succeed. */
  retryable: boolean;
  /** Upstream HTTP status, when there was one. */
  upstreamStatus?: number;
}

/** Suggested HTTP status for API routes (Agent 1 owns the routes; this is only a recommendation). */
export const DATA_ERROR_HTTP_STATUS: Record<DataErrorCode, number> = {
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_UNAVAILABLE: 503,
  UPSTREAM_HTTP: 502,
  INVALID_PAYLOAD: 502,
  CANCELLED: 499,
  INTERNAL: 500,
};

export function toDataError(e: unknown): DataError {
  if (e instanceof UpstreamError) {
    switch (e.kind) {
      case 'timeout':
        return { code: 'UPSTREAM_TIMEOUT', message: 'The NAV provider did not respond in time.', retryable: true };
      case 'network':
        return { code: 'UPSTREAM_UNAVAILABLE', message: 'The NAV provider could not be reached.', retryable: true };
      case 'http': {
        const status = e.status ?? 0;
        return {
          code: 'UPSTREAM_HTTP',
          message: `The NAV provider returned an error (HTTP ${status}).`,
          retryable: status >= 500 || status === 429,
          upstreamStatus: status,
        };
      }
      case 'not-found':
        return { code: 'NOT_FOUND', message: 'The provider has no data for this scheme.', retryable: false, upstreamStatus: e.status };
      case 'invalid-response':
        return { code: 'INVALID_PAYLOAD', message: 'The provider returned data in an unexpected format, so it was not used.', retryable: true };
      case 'cancelled':
        return { code: 'CANCELLED', message: 'The request was cancelled.', retryable: false };
    }
  }
  if (e && typeof e === 'object' && 'issues' in e) {
    return { code: 'INVALID_REQUEST', message: 'The request parameters are invalid.', retryable: false };
  }
  return { code: 'INTERNAL', message: 'An unexpected error occurred while loading data.', retryable: false };
}
