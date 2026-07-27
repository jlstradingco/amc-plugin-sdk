import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runStatus } from '../commands/status.js'
import type { StoredToken } from '../../lib/auth.js'

let dir: string
const token = {
  token: 't',
  refreshToken: 'r',
  uid: 'u',
  github: 'octocat',
  expiresAt: ''
} as StoredToken

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-st-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const write = (name: string): void =>
  fs.writeFileSync(
    path.join(dir, 'x.recipe.json'),
    JSON.stringify({ name, steps: [{ name: 'a', prompt: 'go' }] }),
    'utf-8'
  )

const submissions = (rows: unknown[]): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ submissions: rows }) })
  )
}

describe('runStatus', () => {
  it('shows only rows for the automation in this directory', async () => {
    write('Daily Digest')
    submissions([
      { id: '1', automationId: 'daily-digest', version: '1.0.0', status: 'pending' },
      { id: '2', automationId: 'something-else', version: '1.0.0', status: 'approved' }
    ])
    const res = await runStatus({ cwd: dir, token })
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0]?.automationId).toBe('daily-digest')
  })

  it('shows every row with --all', async () => {
    write('Daily Digest')
    submissions([
      { id: '1', automationId: 'daily-digest', version: '1.0.0', status: 'pending' },
      { id: '2', automationId: 'other', version: '1.0.0', status: 'approved' }
    ])
    expect((await runStatus({ cwd: dir, token, all: true })).rows).toHaveLength(2)
  })

  it('falls back to every row when the directory holds no recipe', async () => {
    submissions([{ id: '1', automationId: 'x', version: '1.0.0', status: 'pending' }])
    expect((await runStatus({ cwd: dir, token })).rows).toHaveLength(1)
  })

  it('exits 0 with a friendly note when there are no submissions', async () => {
    write('Daily Digest')
    submissions([])
    const res = await runStatus({ cwd: dir, token })
    expect(res.exitCode).toBe(0)
    expect(res.rows).toEqual([])
  })

  it('exits 1 with guidance when not signed in', async () => {
    write('Daily Digest')
    expect((await runStatus({ cwd: dir, token: null })).exitCode).toBe(1)
  })

  it('does not throw when the server is unreachable', async () => {
    write('Daily Digest')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')))
    expect((await runStatus({ cwd: dir, token })).exitCode).toBe(1)
  })

  it('prints reviewer notes when present', async () => {
    write('Daily Digest')
    submissions([
      {
        id: '1',
        automationId: 'daily-digest',
        version: '1.0.0',
        status: 'rejected',
        reviewNotes: 'please inline the prompt'
      }
    ])
    const logged: string[] = []
    vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
      logged.push(String(m))
    })
    await runStatus({ cwd: dir, token })
    expect(logged.join('\n')).toContain('please inline the prompt')
  })
})
