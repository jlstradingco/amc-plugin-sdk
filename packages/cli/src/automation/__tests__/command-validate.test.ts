import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runValidate } from '../commands/validate.js'
import type { StoredToken } from '../../lib/auth.js'

let dir: string
const token = { token: 't', refreshToken: 'r', uid: 'u', github: 'g', expiresAt: '' } as StoredToken

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-val-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const write = (body: unknown): void =>
  fs.writeFileSync(path.join(dir, 'x.recipe.json'), JSON.stringify(body), 'utf-8')

const good = {
  name: 'Good',
  executionMode: 'multi-session',
  steps: [{ name: 'a', prompt: 'do the thing' }]
}

describe('runValidate', () => {
  it('exits 0 on a clean recipe', async () => {
    write(good)
    const res = await runValidate({ cwd: dir })
    expect(res.exitCode).toBe(0)
    expect(res.findings).toEqual([])
  })

  it('exits 1 when an error-severity finding is present', async () => {
    write({ ...good, steps: [{ name: 'a', prompt: '' }] })
    expect((await runValidate({ cwd: dir })).exitCode).toBe(1)
  })

  it('exits 0 when only warnings are present', async () => {
    write({ ...good, description: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAA' })
    const res = await runValidate({ cwd: dir })
    expect(res.exitCode).toBe(0)
    expect(res.findings.some((f) => f.severity === 'warning')).toBe(true)
  })

  it('does not call the server without --check', async () => {
    write(good)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await runValidate({ cwd: dir })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports the server verdict with --check', async () => {
    write(good)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ valid: false, errors: ['nope'] })
      })
    )
    const res = await runValidate({ cwd: dir, check: true, token })
    expect(res.server).toEqual({ valid: false, errors: ['nope'] })
    expect(res.exitCode).toBe(1)
  })

  it('exits 0 when the server accepts and locals are clean', async () => {
    write(good)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ valid: true, errors: [] }) })
    )
    expect((await runValidate({ cwd: dir, check: true, token })).exitCode).toBe(0)
  })

  it('does NOT fail when the server is unreachable — degrade only', async () => {
    write(good)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')))
    const res = await runValidate({ cwd: dir, check: true, token })
    expect(res.server).toBeNull()
    expect(res.exitCode).toBe(0)
  })

  it('skips the server check when not signed in, without failing', async () => {
    write(good)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await runValidate({ cwd: dir, check: true, token: null })
    expect(res.exitCode).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exits 1 with a clear message when no recipe file exists', async () => {
    expect((await runValidate({ cwd: dir })).exitCode).toBe(1)
  })

  // --version and --category were passed straight through to the upload, so a typo was
  // only discovered as a bare 400 that had already spent one of five hourly attempts.
  describe('publish flags', () => {
    it('reports a malformed version as an error finding', async () => {
      write(good)
      const res = await runValidate({ cwd: dir, version: 'v1.0.0' })
      expect(res.exitCode).toBe(1)
      expect(res.findings.some((f) => f.code === 'bad-version')).toBe(true)
    })

    it('reports an unknown category', async () => {
      write(good)
      const res = await runValidate({ cwd: dir, category: 'malware' as never })
      expect(res.exitCode).toBe(1)
      expect(res.findings.some((f) => f.code === 'bad-category')).toBe(true)
    })

    it('accepts a well-formed version and category', async () => {
      write(good)
      const res = await runValidate({ cwd: dir, version: '2.1.0', category: 'devops' })
      expect(res.exitCode).toBe(0)
      expect(res.findings).toEqual([])
    })

    it('still reports the recipe findings alongside a flag problem', async () => {
      // A bad flag is one answer to "what is wrong with this publish?", not a reason
      // to stop looking for the others.
      write({ ...good, steps: [{ name: 'a', prompt: '' }] })
      const res = await runValidate({ cwd: dir, version: 'nope' })
      const codes = res.findings.map((f) => f.code)
      expect(codes).toContain('bad-version')
      expect(codes).toContain('empty-prompt')
    })

    it('does not ask the server about a submission it would reject on shape', async () => {
      write(good)
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const res = await runValidate({ cwd: dir, check: true, token, version: '1.0' })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(res.server).toBeNull()
      expect(res.exitCode).toBe(1)
    })

    it('carries a flag problem into the --json payload', async () => {
      write(good)
      const logged: string[] = []
      vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
        logged.push(String(m))
      })
      await runValidate({ cwd: dir, json: true, category: 'malware' as never })
      const parsed = JSON.parse(logged.join('\n'))
      expect(parsed.ok).toBe(false)
      expect(parsed.errors.some((e: { code: string }) => e.code === 'bad-category')).toBe(true)
    })
  })

  it('treats an explicit null token as signed out without touching the network', async () => {
    // The option is typed `StoredToken | null`; under `??` an explicit null fell through
    // to the real disk-and-network lookup instead of meaning "signed out".
    write(good)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await runValidate({ cwd: dir, check: true, token: null })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.server).toBeNull()
    expect(res.exitCode).toBe(0)
  })

  it('emits machine-readable findings with --json', async () => {
    write({ ...good, steps: [{ name: 'a', prompt: '' }] })
    const logged: string[] = []
    vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
      logged.push(String(m))
    })
    await runValidate({ cwd: dir, json: true })
    const parsed = JSON.parse(logged.join('\n'))
    expect(parsed.ok).toBe(false)
    expect(parsed.errors.length).toBeGreaterThan(0)
  })
})
