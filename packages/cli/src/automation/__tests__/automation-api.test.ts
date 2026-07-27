import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  uploadAutomation,
  validateAutomationRemote,
  getMyAutomations
} from '../api/automation-api.js'
import { MarketplaceApiError } from '../../lib/marketplace-api.js'
import type { StoredToken } from '../../lib/auth.js'

const token = {
  token: 't',
  refreshToken: 'r',
  uid: 'u',
  github: 'g',
  expiresAt: ''
} as StoredToken

const req = {
  automationId: 'a',
  version: '1.0.0',
  category: 'other' as const,
  changelog: '',
  definition: {}
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('uploadAutomation', () => {
  it('uploads with a bearer token and returns the submission', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submissionId: 's1', status: 'pending' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await uploadAutomation(token, req)
    expect(res.submissionId).toBe('s1')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/uploadAutomation')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t')
    expect(init.method).toBe('POST')
  })

  it('surfaces the server message as a MarketplaceApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: true, code: 'VALIDATION_FAILED', message: 'bad envelope' })
      })
    )
    await expect(uploadAutomation(token, req)).rejects.toThrow(MarketplaceApiError)
    await expect(uploadAutomation(token, req)).rejects.toThrow('bad envelope')
  })

  it('still errors usefully when the failure body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('not json')
        }
      })
    )
    await expect(uploadAutomation(token, req)).rejects.toThrow('HTTP 502')
  })
})

describe('validateAutomationRemote', () => {
  it('returns the verdict when the endpoint exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ valid: false, errors: ['steps required'] })
      })
    )
    expect(await validateAutomationRemote(token, req)).toEqual({
      valid: false,
      errors: ['steps required']
    })
  })

  it('returns null (not an error) when the endpoint is not deployed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    )
    expect(await validateAutomationRemote(token, req)).toBeNull()
  })

  it('returns null when the network is down — degrade, never fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')))
    expect(await validateAutomationRemote(token, req)).toBeNull()
  })

  it('returns null on an unexpected response shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ nope: true }) })
    )
    expect(await validateAutomationRemote(token, req)).toBeNull()
  })

  it('tolerates a missing errors array on a valid verdict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ valid: true }) })
    )
    expect(await validateAutomationRemote(token, req)).toEqual({ valid: true, errors: [] })
  })
})

describe('getMyAutomations', () => {
  it('lists the caller submissions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ submissions: [{ id: 'x', automationId: 'a' }] })
      })
    )
    expect(await getMyAutomations(token)).toHaveLength(1)
  })

  it('tolerates a missing submissions array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    expect(await getMyAutomations(token)).toEqual([])
  })
})
