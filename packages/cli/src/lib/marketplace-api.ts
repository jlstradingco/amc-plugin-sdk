import * as fs from 'node:fs'
import * as path from 'node:path'
import { getBaseUrl, type StoredToken } from './auth.js'
import { sendAuthed, type ApiErrorResponse } from './authed-fetch.js'

export class MarketplaceApiError extends Error {
  code: string
  details: unknown[]

  constructor(code: string, message: string, details: unknown[] = []) {
    super(message)
    this.name = 'MarketplaceApiError'
    this.code = code
    this.details = details
  }
}

function authHeaders(token: StoredToken): Record<string, string> {
  return { Authorization: `Bearer ${token.token}` }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: ApiErrorResponse | null = null
    try { body = await res.json() as ApiErrorResponse } catch { /* not JSON */ }
    throw new MarketplaceApiError(
      body?.code ?? `HTTP_${res.status}`,
      body?.message ?? `HTTP ${res.status} ${res.statusText}`,
      body?.details ?? []
    )
  }
  return res.json() as Promise<T>
}

export interface SecurityFinding {
  ruleId: string
  severity: 'critical' | 'warning' | 'info'
  file: string
  line: number
  snippet: string
}

export interface UploadResult {
  submissionId: string
  status: string
  message?: string
  securityReport?: {
    severitySummary: { critical: number; warning: number; info: number }
    findings: SecurityFinding[]
    externalUrls: string[]
    cdnDependencies: string[]
  }
  validationResults?: {
    passed: boolean
    checks: Array<{ id: string; passed: boolean; message?: string }>
  }
}

export async function uploadPackage(
  token: StoredToken,
  packagePath: string,
  changelog: string
): Promise<UploadResult> {
  const fileBuffer = fs.readFileSync(packagePath)
  const fileName = path.basename(packagePath)

  const res = await sendAuthed(token, (t) => {
    // Rebuilt per attempt: a retry needs its own body, and a large upload is
    // exactly the case that outlives its token.
    const formData = new FormData()
    formData.append('package', new Blob([fileBuffer]), fileName)
    if (changelog) formData.append('changelog', changelog)

    return globalThis.fetch(`${getBaseUrl()}/uploadPlugin`, {
      method: 'POST',
      headers: authHeaders(t),
      body: formData
    })
  })

  return handleResponse(res)
}

export async function getMyPlugins(
  token: StoredToken
): Promise<{ submissions: Array<{ id: string; pluginId: string; version: string; status: string; submittedAt: string; reviewNotes: string | null }> }> {
  const res = await sendAuthed(token, (t) =>
    globalThis.fetch(`${getBaseUrl()}/getMyPlugins`, {
      headers: authHeaders(t)
    })
  )
  return handleResponse(res)
}

export async function getRegistry(): Promise<{ plugins: Array<{ id: string; version: string; name: string }> }> {
  const res = await globalThis.fetch(`${getBaseUrl()}/getRegistry`)
  return handleResponse(res)
}
