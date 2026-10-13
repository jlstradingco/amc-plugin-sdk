import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkForgedRowsAreInert, describeForgedRowsAreInert, type ForgedRowsOptions, type TestApi } from '../testing/index.js'
import {
  HISTORY_MANIFEST,
  HISTORY_ROWS,
  historyPlugin,
  MAIL_COMMANDS,
  MAIL_MANIFEST,
  mailPlugin,
  type Drain,
  type HistorySightings,
} from './fixtures/command-plugins.js'

/** The effects probe: every request the plugin sends. */
function options(drain: Drain, overrides: Partial<ForgedRowsOptions> = {}): ForgedRowsOptions {
  const sent: string[] = []
  return {
    manifest: MAIL_MANIFEST,
    activate: mailPlugin(drain),
    channel: 'mail',
    commands: MAIL_COMMANDS,
    effects: () => sent.length,
    context: {
      fetch: async (url: string) => {
        sent.push(url)
        return new Response('{}')
      },
    },
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('checkForgedRowsAreInert', () => {
  it('passes a plugin that takes commands only through its channel', async () => {
    await expect(checkForgedRowsAreInert(options('none'))).resolves.toBeUndefined()
  })

  it.each(['cron', 'on-command', 'start-up'] as const)(
    'FAILS a plugin that also runs pending rows (drain: %s)',
    async (drain) => {
      await expect(checkForgedRowsAreInert(options(drain))).rejects.toThrow(/Forged rows ran/)
    }
  )

  it('FAILS a plugin that runs commands it finds in ctx.storage, which agents can write', async () => {
    await expect(checkForgedRowsAreInert(options('storage'))).rejects.toThrow(/Forged rows ran/)
  })

  it('edits and re-arms every existing row, and restarts on every row, however many (150 here)', async () => {
    const seen: HistorySightings = { atStart: [], rearmed: [] }
    const check = checkForgedRowsAreInert(options('none', { manifest: HISTORY_MANIFEST, activate: historyPlugin(seen) }))
    await expect(check).resolves.toBeUndefined()
    // One start before the forging and one on the copied data: both must see every row.
    expect(seen.atStart).toEqual([HISTORY_ROWS, HISTORY_ROWS])
    expect(seen.rearmed.length).toBeGreaterThan(0)
    expect(seen.rearmed.every((count) => count === HISTORY_ROWS)).toBe(true)
  })

  it('FAILS a plugin that drains on a timer, given a settle that lets the time pass', async () => {
    vi.useFakeTimers()
    const settle = async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    }
    await expect(checkForgedRowsAreInert(options('timer', { settle }))).rejects.toThrow(/Forged rows ran/)
  })

  it('passes the same safe plugin under that settle, so the timer case is not failing for its own sake', async () => {
    vi.useFakeTimers()
    const settle = async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    }
    await expect(checkForgedRowsAreInert(options('none', { settle }))).resolves.toBeUndefined()
  })

  it('refuses to vouch for a plugin when its effects probe cannot see a command run', async () => {
    await expect(checkForgedRowsAreInert(options('cron', { effects: () => 0 }))).rejects.toThrow(/Positive control failed/)
  })

  it('fails when the commands cannot reach the channel at all', async () => {
    await expect(checkForgedRowsAreInert(options('none', { channel: 'not-mail' }))).rejects.toThrow(/did not run through/)
  })

  it('needs at least one command', async () => {
    await expect(checkForgedRowsAreInert(options('none', { commands: [] }))).rejects.toThrow(/at least one command/)
  })
})

describe('describeForgedRowsAreInert', () => {
  /** Collects what a test runner would register, so the registered tests can be run here. */
  function collect(): { api: TestApi; names: string[]; bodies: Array<() => Promise<void>> } {
    const names: string[] = []
    const bodies: Array<() => Promise<void>> = []
    const api: TestApi = {
      describe: (name, body) => {
        names.push(name)
        body()
      },
      it: (name, body) => {
        names.push(name)
        bodies.push(body)
      },
    }
    return { api, names, bodies }
  }

  it('registers one test that passes for a safe plugin', async () => {
    const { api, names, bodies } = collect()
    describeForgedRowsAreInert(api, options('none'))
    expect(names[0]).toContain('mail')
    expect(bodies).toHaveLength(1)
    await expect(bodies[0]!()).resolves.toBeUndefined()
  })

  it('registers one test that fails for a vulnerable plugin', async () => {
    const { api, bodies } = collect()
    describeForgedRowsAreInert(api, options('cron'))
    await expect(bodies[0]!()).rejects.toThrow(/Forged rows ran/)
  })
})
