import { getBaseUrl, type StoredToken } from '../../lib/auth.js'
import { MarketplaceApiError } from '../../lib/marketplace-api.js'
import { sendAuthed } from '../../lib/authed-fetch.js'
import type { AutomationPublishRequest } from '../lib/envelope.js'

export interface AutomationSubmission {
  id: string
  automationId: string
  version: string
  status: string
  submittedAt: string
  reviewNotes: string | null
}

export interface ServerValidation {
  valid: boolean
  errors: string[]
}

interface ApiErrorResponse {
  error: true
  code: string
  message: string
}

/**
 * Longest server-chosen error string this surface will echo verbatim.
 *
 * Mirrors the plugin surface's guard (lib/marketplace-api.ts): the CLI renders
 * `err.message` straight to the terminal via `fail(err.message)`, so an unbounded,
 * server-chosen string — a stack trace, an HTML error page, a wall of validation
 * detail — must not become the CLI's whole output. A short message is the server's
 * own actionable reason and is kept; anything longer is replaced by a fixed line that
 * still carries the status code.
 */
const MAX_SERVER_MESSAGE_LENGTH = 300

function boundedServerMessage(body: ApiErrorResponse | null, status: number): string {
  const raw = typeof body?.message === 'string' ? body.message.trim() : ''
  if (raw !== '' && raw.length <= MAX_SERVER_MESSAGE_LENGTH) return raw
  return `The marketplace rejected the request (HTTP ${status}).`
}

function authHeaders(token: StoredToken): Record<string, string> {
  return { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: ApiErrorResponse | null = null
    try {
      body = (await res.json()) as ApiErrorResponse
    } catch {
      /* not JSON */
    }
    throw new MarketplaceApiError(
      body?.code ?? `HTTP_${res.status}`,
      boundedServerMessage(body, res.status),
      []
    )
  }
  return res.json() as Promise<T>
}

export async function uploadAutomation(
  token: StoredToken,
  req: AutomationPublishRequest
): Promise<{ submissionId: string; status: string }> {
  // Renews and retries once if the credential is refused mid-flight, exactly like
  // the plugin surface's uploadPackage. Serializing per attempt costs nothing here
  // (a recipe is at most 256 KB of JSON) and keeps each attempt self-contained.
  const res = await sendAuthed(token, (t) =>
    globalThis.fetch(`${getBaseUrl()}/uploadAutomation`, {
      method: 'POST',
      headers: authHeaders(t),
      body: JSON.stringify(req)
    })
  )
  return handle(res)
}

/**
 * Ask the server for the authoritative verdict WITHOUT creating a submission.
 *
 * Returns null — never throws — when the endpoint is not deployed, is
 * unreachable, or answers with anything unexpected. `validate --check` treats
 * null as "server validation unavailable" and still exits on the local result:
 * a missing optional endpoint is not the author's problem (spec §7).
 */
export async function validateAutomationRemote(
  token: StoredToken,
  req: AutomationPublishRequest
): Promise<ServerValidation | null> {
  try {
    const res = await sendAuthed(token, (t) =>
      globalThis.fetch(`${getBaseUrl()}/validateAutomation`, {
        method: 'POST',
        headers: authHeaders(t),
        body: JSON.stringify(req)
      })
    )
    if (!res.ok) return null
    const data = (await res.json()) as Partial<ServerValidation>
    if (typeof data.valid !== 'boolean') return null
    return { valid: data.valid, errors: Array.isArray(data.errors) ? data.errors : [] }
  } catch {
    return null
  }
}

export async function getMyAutomations(token: StoredToken): Promise<AutomationSubmission[]> {
  const res = await sendAuthed(token, (t) =>
    globalThis.fetch(`${getBaseUrl()}/getMyAutomations`, {
      headers: authHeaders(t)
    })
  )
  const data = await handle<{ submissions?: AutomationSubmission[] }>(res)
  return Array.isArray(data.submissions) ? data.submissions : []
}
