import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CommandError,
  createCommandChannel,
  createCommandClient,
  defineCommand,
  RETIRED_ROW_NOTE,
  type CommandChannelOptions,
  type CommandMapOf,
  type CommandSpecs,
} from '../commands/index.js'
import { PROTOCOL_VERSION, startMethod, statusMethod } from '../commands/protocol.js'
import { createRpcDouble, createTestContext, type RpcDouble, type TestHarness } from '../testing/index.js'

// Every test drives the channel the way a panel does — through the rpc double, which makes the
// host's JSON round trip — unless it is testing the in-process `submit` door.

const NAME = 'demo'
const SECRET = 'TOP-SECRET-7f3a'

interface Gate {
  opened: Promise<void>
  open: () => void
}

function gate(): Gate {
  let open = (): void => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open }
}

const asRecord = (input: unknown): Record<string, unknown> => {
  if (typeof input !== 'object' || input === null) throw new Error('input must be an object')
  return input as Record<string, unknown>
}

/** A recorder of every run, and commands that report into it. */
function demoCommands(runs: string[], gates: Map<string, Gate> = new Map()) {
  return {
    send: defineCommand({
      parse: (input: unknown) => {
        const to = asRecord(input).to
        if (typeof to !== 'string') throw new Error('to must be a string')
        return { to }
      },
      run: async ({ to }) => {
        runs.push(`send:${to}`)
        await gates.get(to)?.opened
        return { sent: to }
      },
    }),
    peek: defineCommand({
      mode: 'read',
      parse: (input: unknown) => {
        const key = asRecord(input).key
        if (typeof key !== 'string') throw new Error('key must be a string')
        return { key }
      },
      run: async ({ key }) => {
        runs.push(`peek:${key}`)
        await gates.get(key)?.opened
        return key.length
      },
    }),
    stuck: defineCommand({ parse: () => null, run: () => new Promise<never>(() => {}) }),
    explode: defineCommand({
      parse: () => null,
      run: () => {
        throw new Error(`boom ${SECRET}`)
      },
    }),
    unsendable: defineCommand({ parse: () => null, run: () => ({ big: BigInt(1) }) }),
    nothing: defineCommand({ parse: () => null, run: () => undefined }),
  }
}

type DemoCommands = ReturnType<typeof demoCommands>

interface Setup {
  double: RpcDouble
  harness: TestHarness
  runs: string[]
  gates: Map<string, Gate>
  channel: ReturnType<typeof createCommandChannel<DemoCommands>>
  client: ReturnType<typeof createCommandClient<CommandMapOf<DemoCommands>>>
}

function setup(options: Partial<CommandChannelOptions<DemoCommands>> = {}, harness?: TestHarness): Setup {
  const double = createRpcDouble()
  const h = harness ?? createTestContext({ rpc: double.rpc })
  if (harness) h.ctx.rpc = double.rpc
  const runs: string[] = []
  const gates = new Map<string, Gate>()
  const channel = createCommandChannel(h.ctx, { name: NAME, commands: demoCommands(runs, gates), ...options })
  const client = createCommandClient<CommandMapOf<DemoCommands>>(NAME, { backend: double.backend })
  return { double, harness: h, runs, gates, channel, client }
}

const start = (double: RpcDouble, type: string, input?: unknown) =>
  double.backend.invoke(startMethod(NAME), { v: PROTOCOL_VERSION, type, input }) as Promise<Record<string, unknown>>
const status = (double: RpcDouble, id: unknown) =>
  double.backend.invoke(statusMethod(NAME), { v: PROTOCOL_VERSION, id }) as Promise<Record<string, unknown>>

async function acceptedId(double: RpcDouble, type: string, input?: unknown): Promise<string> {
  const reply = await start(double, type, input)
  expect(reply).toMatchObject({ ok: true })
  return reply.id as string
}

/** Let every queued microtask and zero-delay step run. */
const flush = () => new Promise((resolve) => setImmediate(resolve))

afterEach(() => {
  vi.useRealTimers()
})

describe('a panel command runs once and its result is handed over once', () => {
  it('runs through the channel and resolves with the result', async () => {
    const { client, runs } = setup()
    await expect(client.run('send', { to: 'ada' })).resolves.toEqual({ sent: 'ada' })
    expect(runs).toEqual(['send:ada'])
  })

  it('answers unknown the second time the same result is asked for', async () => {
    const { double } = setup()
    const id = await acceptedId(double, 'send', { to: 'ada' })
    await expect(status(double, id)).resolves.toEqual({ state: 'done', result: { sent: 'ada' } })
    await expect(status(double, id)).resolves.toEqual({ state: 'unknown' })
  })

  it('reports a command that resolves to nothing as done with no result', async () => {
    const { client } = setup()
    await expect(client.run('nothing', null)).resolves.toBeUndefined()
  })

  it('answers unknown for an id it never accepted, and for a malformed status call', async () => {
    const { double } = setup()
    await expect(status(double, 'no-such-id')).resolves.toEqual({ state: 'unknown' })
    await expect(double.backend.invoke(statusMethod(NAME), 'garbage')).resolves.toEqual({ state: 'unknown' })
  })
})

describe('input is checked before anything is queued', () => {
  it('refuses input that fails parse, runs nothing, and keeps working afterwards', async () => {
    const { client, runs } = setup()
    await expect(client.run('send', { to: 42 } as never)).rejects.toMatchObject({
      code: 'invalid-input',
      message: 'to must be a string',
    })
    expect(runs).toEqual([])
    await expect(client.run('send', { to: 'ada' })).resolves.toEqual({ sent: 'ada' })
  })

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'nope'])(
    'refuses the command type %s, which the channel does not declare',
    async (type) => {
      const { double, runs } = setup()
      const reply = await start(double, type, {})
      expect(reply).toMatchObject({ ok: false, code: 'invalid-input' })
      expect(runs).toEqual([])
    }
  )

  it('refuses an input over the size limit', async () => {
    const { client, runs } = setup({ limits: { maxInputBytes: 64 } })
    await expect(client.run('send', { to: 'x'.repeat(100) })).rejects.toMatchObject({ code: 'refused' })
    expect(runs).toEqual([])
  })

  it('refuses a request from a panel built for another protocol version', async () => {
    const { double, runs } = setup()
    const reply = await double.backend.invoke(startMethod(NAME), { v: 999, type: 'send', input: { to: 'ada' } })
    expect(reply).toMatchObject({ ok: false, code: 'refused' })
    expect(runs).toEqual([])
  })
})

describe('ordering and limits', () => {
  it('runs write commands one at a time, in arrival order', async () => {
    const { client, runs, gates } = setup()
    const a = gate()
    gates.set('a', a)
    const results = [client.run('send', { to: 'a' }), client.run('send', { to: 'b' }), client.run('send', { to: 'c' })]
    await flush()
    expect(runs).toEqual(['send:a'])
    a.open()
    await expect(Promise.all(results)).resolves.toEqual([{ sent: 'a' }, { sent: 'b' }, { sent: 'c' }])
    expect(runs).toEqual(['send:a', 'send:b', 'send:c'])
  })

  it('runs read commands side by side, but never more than the cap', async () => {
    const { client, runs, gates } = setup({ limits: { maxParallelReads: 2 } })
    for (const key of ['k1', 'k2', 'k3']) gates.set(key, gate())
    const results = ['k1', 'k2', 'k3'].map((key) => client.run('peek', { key }))
    await flush()
    expect(runs).toEqual(['peek:k1', 'peek:k2'])
    gates.get('k1')!.open()
    await flush()
    expect(runs).toEqual(['peek:k1', 'peek:k2', 'peek:k3'])
    gates.get('k2')!.open()
    gates.get('k3')!.open()
    await expect(Promise.all(results)).resolves.toEqual([2, 2, 2])
  })

  it('drops an uncollected result once it expires', async () => {
    vi.useFakeTimers()
    const { double } = setup({ limits: { resultTtlMs: 1000 } })
    const id = await acceptedId(double, 'send', { to: 'ada' })
    await vi.advanceTimersByTimeAsync(1001)
    await expect(status(double, id)).resolves.toEqual({ state: 'unknown' })
  })
})

describe('a command that never finishes is visible, holds the queue, and loses nothing', () => {
  it('keeps later commands waiting (not run, not lost), refuses beyond the limit, and reports how long it has run', async () => {
    vi.useFakeTimers()
    const { double, runs } = setup()
    const stuckId = await acceptedId(double, 'stuck', null)
    const waiting: string[] = []
    for (let i = 0; i < 49; i++) waiting.push(await acceptedId(double, 'send', { to: `w${i}` }))

    // 1 running + 49 waiting = the default limit of 50: the next one is refused, not queued.
    await expect(start(double, 'send', { to: 'over' })).resolves.toMatchObject({ ok: false, code: 'refused' })

    await vi.advanceTimersByTimeAsync(60_000)
    const answers = Promise.all([stuckId, ...waiting].map((id) => status(double, id)))
    await vi.advanceTimersByTimeAsync(15_000)
    const [stuck, ...queued] = await answers
    expect(stuck).toMatchObject({ state: 'pending', waiting: 'running' })
    expect(stuck!.runningForMs).toBeGreaterThanOrEqual(75_000)
    for (const reply of queued) {
      expect(reply).toMatchObject({ state: 'pending', waiting: 'queued' })
      expect(reply.runningForMs).toBeGreaterThanOrEqual(75_000)
    }
    expect(runs).toEqual([])
  })
})

describe('failures are honest and never leak data into the log', () => {
  it('reports a throwing command as failed with its message', async () => {
    const { client } = setup()
    await expect(client.run('explode', null)).rejects.toMatchObject({ code: 'failed', message: `boom ${SECRET}` })
  })

  it('reports a result that cannot be sent back as failed, saying that it ran', async () => {
    const { client } = setup()
    await expect(client.run('unsendable', null)).rejects.toMatchObject({
      code: 'failed',
      message: expect.stringContaining('ran, but'),
    })
  })

  it('never writes an input, a result or an error message to the log', async () => {
    const { client, harness } = setup()
    await client.run('send', { to: SECRET })
    await client.run('explode', null).catch(() => undefined)
    await client.run('send', { to: 42 } as never).catch(() => undefined)
    expect(harness.logs.length).toBeGreaterThan(0)
    expect(JSON.stringify(harness.logs)).not.toContain(SECRET)
  })
})

describe('the channel keeps nothing in ctx.storage, which AI agents can read and write', () => {
  // Omniscio's control server lets any agent session list, read, write and delete a plugin's
  // ctx.storage (GET/PUT/DELETE /plugins/:id/kv/:key). So nothing the channel could read back
  // from there is trustworthy, and nothing it wrote there would be private.
  const variants = [
    ['no options', {}],
    ['the removed durable flag', { durable: true }],
  ] as const

  /** Make every storage method record the call and throw, so a single use fails the test. */
  function forbidStorage(harness: TestHarness, touched: string[]): void {
    const storage = harness.ctx.storage as unknown as Record<string, unknown>
    for (const method of ['get', 'set', 'delete', 'list']) {
      storage[method] = (key?: unknown) => {
        touched.push(`${method}(${String(key ?? '')})`)
        throw new Error(`the command channel called ctx.storage.${method}`)
      }
    }
  }

  it.each(variants)('never calls ctx.storage: at start, on accept, run and status, or after a restart (%s)', async (_label, extra) => {
    const touched: string[] = []
    const first = createTestContext()
    forbidStorage(first, touched)
    const before = setup(extra as never, first)
    await expect(before.client.run('send', { to: 'ada' })).resolves.toEqual({ sent: 'ada' })

    const second = createTestContext()
    forbidStorage(second, touched)
    const after = setup(extra as never, second)
    await expect(after.client.run('peek', { key: 'k' })).resolves.toBe(1)
    expect(touched).toEqual([])
  })

  it.each(variants)('runs nothing an agent planted in storage, at start or later (%s)', async (_label, extra) => {
    const harness = createTestContext()
    // What an agent can PUT through /plugins/:id/kv/:key: the exact shape the old durable copy had.
    const planted = { type: 'send', input: { to: 'attacker' }, acceptedAt: 0 }
    await harness.ctx.storage.set(`__commands:${NAME}:planted`, planted)
    const { client, double, runs } = setup(extra as never, harness)
    await flush()
    await expect(client.run('send', { to: 'ada' })).resolves.toEqual({ sent: 'ada' })
    await flush()
    expect(runs).toEqual(['send:ada'])
    await expect(status(double, 'planted')).resolves.toEqual({ state: 'unknown' })
    await expect(harness.ctx.storage.get(`__commands:${NAME}:planted`)).resolves.toEqual(planted)
  })
})

describe('durable channels keep a private copy that makes a restart safe', () => {
  /** A fresh worker on the same plugin data: a new harness holding the old storage. */
  async function restart(old: TestHarness): Promise<Setup> {
    const next = createTestContext()
    for (const { key, value } of await old.ctx.storage.list()) await next.ctx.storage.set(key, value)
    const fresh = setup({ durable: true }, next)
    await fresh.channel.ready
    return fresh
  }

  const savedCopies = async (h: TestHarness) => (await h.ctx.storage.list(`__commands:${NAME}:`)).length

  it('saves a copy while a command waits and deletes it just before the command runs', async () => {
    const { double, harness, gates } = setup({ durable: true })
    const first = gate()
    gates.set('first', first)
    const firstId = await acceptedId(double, 'send', { to: 'first' })
    await flush()
    const secondId = await acceptedId(double, 'send', { to: 'second' })
    expect(await savedCopies(harness)).toBe(1)
    first.open()
    await expect(status(double, firstId)).resolves.toMatchObject({ state: 'done' })
    await expect(status(double, secondId)).resolves.toMatchObject({ state: 'done' })
    expect(await savedCopies(harness)).toBe(0)
  })

  it('resumes waiting commands after a restart, in order, and never re-runs the one that had started', async () => {
    // A frozen clock gives every command the same millisecond — the tie that once let
    // recovery replay them in random-id order.
    vi.useFakeTimers({ toFake: ['Date'] })
    const before = setup({ durable: true })
    before.gates.set('started', gate())
    await acceptedId(before.double, 'send', { to: 'started' })
    await flush()
    const waitingIds = [await acceptedId(before.double, 'send', { to: 'w1' }), await acceptedId(before.double, 'send', { to: 'w2' })]

    const after = await restart(before.harness)
    await Promise.all(waitingIds.map((id) => status(after.double, id)))
    expect(after.runs).toEqual(['send:w1', 'send:w2'])
    expect(await savedCopies(after.harness)).toBe(0)
  })

  it('refuses to run a waiting command whose saved copy disappeared', async () => {
    const { double, harness, gates, runs } = setup({ durable: true })
    const first = gate()
    gates.set('first', first)
    await acceptedId(double, 'send', { to: 'first' })
    await flush()
    const secondId = await acceptedId(double, 'send', { to: 'second' })
    for (const { key } of await harness.ctx.storage.list(`__commands:${NAME}:`)) await harness.ctx.storage.delete(key)
    first.open()
    await expect(status(double, secondId)).resolves.toMatchObject({ state: 'refused' })
    expect(runs).toEqual(['send:first'])
  })

  it('drops a saved command that no longer parses, without running it', async () => {
    const before = setup({ durable: true })
    await before.harness.ctx.storage.set(`__commands:${NAME}:broken`, { type: 'send', input: { to: 7 }, acceptedAt: 1 })
    const after = await restart(before.harness)
    await flush()
    expect(after.runs).toEqual([])
    expect(await savedCopies(after.harness)).toBe(0)
  })

  describe('a panel still waiting when the plugin restarts', () => {
    /** Accept a stuck write, then start `send` from a panel, then restart onto `commands`. */
    async function restartWhileWaiting(options: { durable: boolean; commands: CommandSpecs }) {
      vi.useFakeTimers()
      const double = createRpcDouble()
      const before = createTestContext({ rpc: double.rpc })
      createCommandChannel(before.ctx, { name: NAME, commands: demoCommands([]), durable: options.durable })
      await acceptedId(double, 'stuck', null)
      const client = createCommandClient<CommandMapOf<DemoCommands>>(NAME, { backend: double.backend })
      const outcome = client.run('send', { to: 'b' }).then(
        (result) => ({ result }),
        (error: unknown) => ({ error })
      )
      await vi.advanceTimersByTimeAsync(0)
      double.setStopped(true)
      const after = createTestContext({ rpc: double.rpc })
      for (const { key, value } of await before.ctx.storage.list()) await after.ctx.storage.set(key, value)
      await createCommandChannel(after.ctx, { name: NAME, commands: options.commands, durable: options.durable }).ready
      double.setStopped(false)
      await vi.advanceTimersByTimeAsync(5_000)
      return outcome
    }

    it('is told refused — it never ran — when the update can no longer accept its saved input', async () => {
      const runs: string[] = []
      const updated = {
        ...demoCommands(runs),
        send: defineCommand({
          parse: (input: unknown) => {
            const { to, subject } = asRecord(input)
            if (typeof subject !== 'string') throw new Error('subject is now required')
            return { to: String(to), subject }
          },
          run: async ({ to }) => {
            runs.push(`send:${to}`)
            return { sent: to }
          },
        }),
      }
      const outcome = await restartWhileWaiting({ durable: true, commands: updated })
      expect(outcome).toMatchObject({ error: { code: 'refused', message: expect.stringContaining('no longer passes') } })
      expect(runs).toEqual([])
    })

    it('gets the result when its durable command resumes after the restart', async () => {
      const runs: string[] = []
      const outcome = await restartWhileWaiting({ durable: true, commands: demoCommands(runs) })
      expect(outcome).toEqual({ result: { sent: 'b' } })
      expect(runs).toEqual(['send:b'])
    })

    it('is told the outcome is unknown when the channel was not durable', async () => {
      const outcome = await restartWhileWaiting({ durable: false, commands: demoCommands([]) })
      expect(outcome).toMatchObject({ error: { code: 'outcome-unknown' } })
    })
  })

  it('refuses at creation a durable input limit the host could not store', () => {
    const { ctx } = createTestContext()
    expect(() =>
      createCommandChannel(ctx, { name: NAME, commands: {}, durable: true, limits: { maxInputBytes: 2 * 1024 * 1024 } })
    ).toThrow(/at most/)
  })
})

describe('the in-process door and the guards around the channel', () => {
  it('submit runs through the same queue and returns the result', async () => {
    const { channel, runs } = setup()
    await expect(channel.submit('send', { to: 'cli' })).resolves.toEqual({ sent: 'cli' })
    await expect(channel.submit('send', { to: 1 })).rejects.toBeInstanceOf(CommandError)
    expect(runs).toEqual(['send:cli'])
  })

  it('on an Omniscio without ctx.rpc: activation does not crash, it warns once, and submit still works', async () => {
    const harness = createTestContext()
    const runs: string[] = []
    const channel = createCommandChannel(harness.ctx, { name: NAME, commands: demoCommands(runs) })
    expect(harness.logs.filter((log) => log.level === 'warn' && log.message.includes('ctx.rpc'))).toHaveLength(1)
    await expect(channel.submit('send', { to: 'cli' })).resolves.toEqual({ sent: 'cli' })
  })

  it('refuses a second channel with the same name on one plugin', () => {
    const { harness } = setup()
    expect(() => createCommandChannel(harness.ctx, { name: NAME, commands: {} })).toThrow(/already has a channel/)
  })

  it.each(['', 'Demo', 'has space', 'x'.repeat(41)])('refuses the channel name %j', (name) => {
    const { ctx } = createTestContext()
    expect(() => createCommandChannel(ctx, { name, commands: {} })).toThrow(/must match/)
  })
})

describe('retireRows settles legacy command rows once and never runs them', () => {
  it('marks every still-to-run row retired, leaves finished rows alone, and is safe to repeat', async () => {
    const { channel, harness, runs } = setup()
    const db = harness.ctx.db
    for (const status of ['pending', 'queued', 'running', 'done']) {
      await db.insert('commands', { type: 'send', payload: { to: 'x' }, status, note: '' })
    }
    await expect(channel.retireRows('commands', { noteColumn: 'note' })).resolves.toBe(3)
    const rows = await db.query('commands')
    expect(rows.map((row) => row.status).sort()).toEqual(['done', 'error', 'error', 'error'])
    expect(rows.filter((row) => row.status === 'error').every((row) => row.note === RETIRED_ROW_NOTE)).toBe(true)

    // An agent re-arms one: the next start-up settles it again, still without running it.
    await db.update('commands', String(rows[0]!.id), { status: 'pending' })
    await expect(channel.retireRows('commands')).resolves.toBe(1)
    expect(runs).toEqual([])
  })

  it('settles every still-to-run row however many there are: 250 pending rows leave none', async () => {
    const { channel, harness, runs } = setup()
    for (let n = 0; n < 250; n++) {
      await harness.ctx.db.insert('commands', { type: 'send', payload: { to: `r${n}` }, status: 'pending' })
    }
    await expect(channel.retireRows('commands')).resolves.toBe(250)
    await expect(harness.ctx.db.query('commands', { where: { status: 'pending' }, limit: 1000 })).resolves.toEqual([])
    expect(runs).toEqual([])
  })

  it('stops when rows do not change, and warns once with the table and how many are left, never their data', async () => {
    const { channel, harness } = setup()
    for (let n = 0; n < 150; n++) {
      await harness.ctx.db.insert('commands', { type: 'send', payload: { to: SECRET }, status: 'pending' })
    }
    // Every update "succeeds" and nothing changes, as if an agent re-armed each row at once.
    harness.ctx.db.update = () => Promise.resolve()
    await expect(channel.retireRows('commands')).resolves.toEqual(expect.any(Number))
    const warns = harness.logs.filter((log) => log.level === 'warn' && log.message.includes('retireRows'))
    expect(warns).toHaveLength(1)
    expect(warns[0]!.message).toContain('"commands"')
    expect(warns[0]!.message).toContain('150')
    expect(JSON.stringify(harness.logs)).not.toContain(SECRET)
  })

  it('refuses a retiredStatus that is itself a still-to-run status, before touching a row', async () => {
    const { channel, harness } = setup()
    await harness.ctx.db.insert('commands', { type: 'send', payload: { to: 'x' }, status: 'pending' })
    await expect(channel.retireRows('commands', { retiredStatus: 'pending' })).rejects.toThrow(/retiredStatus/)
  })
})

/** Compile-time check that the client is typed from the backend's spec. */
export type _ClientTyping = [
  CommandMapOf<DemoCommands>['send']['input'],
  CommandMapOf<DemoCommands>['peek']['result'],
] extends [{ to: string }, number]
  ? true
  : never
export const _clientTyping: _ClientTyping = true
