import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createCommandChannel,
  createCommandClient,
  defineCommand,
  type PendingStatus,
} from '../commands/index.js'
import type { BridgeBackend } from '../types/bridge.js'
import { createRpcDouble, createTestContext } from '../testing/index.js'
import { HOST_INVOKE_FAILURES } from './fixtures/host-mirror.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const globals = globalThis as { AgentMC?: unknown }

const rejectingBackend = (message: string): BridgeBackend => ({
  invoke: () => Promise.reject(new Error(message)),
})

/** A backend that accepts the start and then answers status with `reply`. */
const acceptingBackend = (statusReply: unknown): BridgeBackend => ({
  invoke: (method: string) =>
    Promise.resolve(method.endsWith(':cmd.start') ? { ok: true, id: 'id-1' } : statusReply),
})

function gate(): { opened: Promise<void>; open: () => void } {
  let open = (): void => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open }
}

/** A real channel behind the rpc double, with one slow command released by `release`. */
function slowChannel() {
  const double = createRpcDouble()
  const harness = createTestContext({ rpc: double.rpc })
  const release = gate()
  createCommandChannel(harness.ctx, {
    name: 'demo',
    commands: {
      slow: defineCommand({ parse: () => null, run: () => release.opened.then(() => 'finished') }),
      ping: defineCommand({ parse: () => null, run: () => 'pong' }),
    },
  })
  return { double, release, client: createCommandClient('demo', { backend: double.backend }) }
}

afterEach(() => {
  delete globals.AgentMC
  vi.useRealTimers()
})

describe('on an Omniscio without the panel-to-backend channel', () => {
  it('throws host-too-old and touches neither storage nor the database', async () => {
    const touched: string[] = []
    const spy = new Proxy({}, { get: (_target, key) => () => (touched.push(String(key)), Promise.resolve()) })
    globals.AgentMC = { storage: spy, db: spy, settings: spy }
    await expect(createCommandClient('demo').run('send', { to: 'x' })).rejects.toMatchObject({ code: 'host-too-old' })
    expect(touched).toEqual([])
  })

  it('throws host-too-old when there is no AgentMC at all', async () => {
    await expect(createCommandClient('demo').run('send', {})).rejects.toMatchObject({ code: 'host-too-old' })
  })
})

describe('by default the client uses window.AgentMC.backend', () => {
  it('reads it when a command runs, so a client made before the bridge loads still works', async () => {
    const { double } = slowChannel()
    const client = createCommandClient('demo')
    globals.AgentMC = { backend: double.backend }
    await expect(client.run('ping', null)).resolves.toBe('pong')
  })
})

describe('a failed start is classified by what the host actually said', () => {
  it.each(HOST_INVOKE_FAILURES.notDelivered)('"%s" means it never arrived: worker-not-ready', async (text) => {
    const client = createCommandClient('demo', { backend: rejectingBackend(text) })
    await expect(client.run('send', {})).rejects.toMatchObject({ code: 'worker-not-ready' })
  })

  it.each(HOST_INVOKE_FAILURES.busy)('"%s" means the host turned it away: refused', async (text) => {
    const client = createCommandClient('demo', { backend: rejectingBackend(text) })
    await expect(client.run('send', {})).rejects.toMatchObject({ code: 'refused' })
  })

  it.each([...HOST_INVOKE_FAILURES.ambiguous, 'Some message no host version has ever sent'])(
    '"%s" may have arrived: outcome-unknown, never "nothing ran"',
    async (text) => {
      const client = createCommandClient('demo', { backend: rejectingBackend(text) })
      await expect(client.run('send', {})).rejects.toMatchObject({ code: 'outcome-unknown' })
    }
  )

  it('a start answer it cannot read is outcome-unknown', async () => {
    const client = createCommandClient('demo', { backend: { invoke: () => Promise.resolve('garbage') } })
    await expect(client.run('send', {})).rejects.toMatchObject({ code: 'outcome-unknown' })
  })
})

describe('once the backend has accepted the command', () => {
  it('keeps asking while the backend restarts, then calls the outcome unknown if it never returns', async () => {
    vi.useFakeTimers()
    const { double } = slowChannel()
    let attempts = 0
    const counting: BridgeBackend = {
      invoke: (method, ...args) => {
        attempts++
        return double.backend.invoke(method, ...args)
      },
    }
    const outcome = createCommandClient('demo', { backend: counting }).run('slow', null).catch((err: unknown) => err)
    await vi.advanceTimersByTimeAsync(0)
    double.setStopped(true)
    await vi.advanceTimersByTimeAsync(61_000)
    expect(await outcome).toMatchObject({ code: 'outcome-unknown' })
    // One start, then a status call every 2 seconds for the minute the backend stayed away.
    expect(attempts).toBeGreaterThan(20)
  })

  it.each([undefined, 'garbage', { state: 'pending' }, { state: 'bogus' }])(
    'a status answer it cannot read (%j) is outcome-unknown',
    async (reply) => {
      const client = createCommandClient('demo', { backend: acceptingBackend(reply) })
      await expect(client.run('send', {})).rejects.toMatchObject({ code: 'outcome-unknown' })
    }
  )

  it('reports each pending answer to onPending, with how long the command has been running', async () => {
    vi.useFakeTimers()
    const { release, client } = slowChannel()
    const seen: PendingStatus[] = []
    const result = client.run('slow', null, { onPending: (status) => seen.push(status) })
    await vi.advanceTimersByTimeAsync(15_000)
    expect(seen).toHaveLength(1)
    expect(seen[0]?.waiting).toBe('running')
    expect(seen[0]?.runningForMs).toBeGreaterThanOrEqual(15_000)
    release.open()
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(result).resolves.toBe('finished')
  })
})

describe('the client checks its own input', () => {
  it('refuses an input that is not plain JSON data before sending anything', async () => {
    const sent: unknown[] = []
    const backend: BridgeBackend = { invoke: (...args) => (sent.push(args), Promise.resolve({ ok: true, id: 'x' })) }
    const client = createCommandClient('demo', { backend })
    await expect(client.run('send', { n: BigInt(1) })).rejects.toMatchObject({ code: 'invalid-input' })
    expect(sent).toEqual([])
  })
})

describe('the client half is browser-safe', () => {
  it('loads nothing at runtime but its sibling modules — no node: import, no dependency', () => {
    const allowed = new Set(['./errors.js', './protocol.js'])
    for (const file of ['client.ts', 'protocol.ts', 'errors.ts']) {
      const source = fs.readFileSync(path.join(here, '../commands', file), 'utf-8')
      const runtimeImports = [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1])
      for (const specifier of runtimeImports) expect(allowed.has(specifier!), `${file} imports ${specifier}`).toBe(true)
      expect(source, file).not.toMatch(/require\(|from\s+'node:/)
    }
  })
})
