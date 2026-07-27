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
