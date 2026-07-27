// Shared transport for authenticated marketplace calls: send, and renew the
// credential once if the server refuses it mid-flight.
//
// Lives in its own module rather than in marketplace-api.ts because both API
// clients need it — the plugin surface (`amc-plugin`) and the automation surface
// (`amc-automation`) — and the automation client should not have to import the
// plugin client just to make a request.

import { tryRefreshStoredToken, type StoredToken } from './auth.js'

/** The error envelope every marketplace endpoint uses for a failure. */
export interface ApiErrorResponse {
  error: true
  code: string
  message: string
  details?: unknown[]
}

/**
 * Error codes for which a renewed credential could plausibly succeed. Anything
 * else is a decision about WHO you are, not about whether your token is fresh,
 * and retrying it just repeats the request.
 */
const RENEWABLE_ERROR_CODES = new Set(['AUTH_REQUIRED'])

/**
 * Is this rejection worth spending a token renewal and a second request on?
 *
 * 401 always is — that is what the server's `authenticate` middleware returns for
 * a missing, malformed, or expired ID token.
 *
 * 403 usually is NOT. The marketplace's 403 is `FORBIDDEN`, raised for things a
 * new token cannot change: publishing into a namespace another developer owns,
 * or calling an admin endpoint without the role. Retrying those re-sends the
 * ENTIRE request — for `uploadPlugin` that is up to 50 MB of package bytes, sent
 * a second time for a guaranteed failure, and a second slot burned against the
 * hourly upload limit. So a 403 only earns a retry when the body identifies it
 * as an auth-freshness problem after all (a proxy or a future server revision
 * answering `AUTH_REQUIRED` with the wrong status).
 *
 * The body is read from a CLONE: the original response still has to be readable
 * by the caller's error handler when we decide not to retry.
 */
export async function isRenewableRejection(res: Response): Promise<boolean> {
  if (res.status === 401) return true
  if (res.status !== 403) return false
  try {
    const body = (await res.clone().json()) as Partial<ApiErrorResponse>
    return typeof body.code === 'string' && RENEWABLE_ERROR_CODES.has(body.code)
  } catch {
    // Not JSON, or unreadable — treat an unexplained 403 as the permanent kind.
    return false
  }
}

/**
 * Send an authenticated request, renewing once if the server rejects the token.
 *
 * The freshness check happens before a command runs, so a token can still be
 * refused mid-flight: a long upload can outlive it, the local clock can be off
 * by more than the 5-minute buffer, or the session can be revoked server-side.
 * Without this, publishing failed outright with a raw 401 while a perfectly
 * good refresh token sat on disk.
 *
 * `send` is re-invoked rather than a saved Response being replayed, so each
 * attempt builds its own request body. Retrying is safe for the rejections
 * `isRenewableRejection` admits: the server rejects them in its auth middleware,
 * before the handler runs, so there is no double publish.
 */
export async function sendAuthed(
  token: StoredToken,
  send: (t: StoredToken) => Promise<Response>
): Promise<Response> {
  const res = await send(token)
  if (!(await isRenewableRejection(res))) return res

  const refreshed = await tryRefreshStoredToken()
  // Nothing to renew with, or the refresh token is dead too — let the caller
  // surface the original rejection rather than inventing a different error.
  if (!refreshed) return res

  return send(refreshed)
}
