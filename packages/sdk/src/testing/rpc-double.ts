/**
 * An in-memory stand-in for Omniscio's panel-to-backend channel (`AgentMC.backend.invoke` →
 * `ctx.rpc.handle`), faithful in the ways that change what a plugin sees:
 *
 * - arguments and results make the host's JSON round trip (a `Date` arrives as a string,
 *   `undefined` in an array as `null`, a `BigInt` or cyclic result fails the call);
 * - a handler's error reaches the panel as its message only;
 * - a missing handler, a stopped backend and a backend stopped mid-call fail with the host's own
 *   texts (host master 8d41f0cdf6 — see `__tests__/fixtures/host-mirror.ts`).
 *
 * What it does NOT model: the 240-second host timeout and the 100-calls-in-flight cap.
 */
import type { PluginRpc } from '../types/context.js'
import type { BridgeBackend } from '../types/bridge.js'
import { HOST_NON_SERIALIZABLE_TEXT, jsonImage, messageOf } from '../commands/protocol.js'

export interface RpcDouble {
  /** The backend half: `createTestContext({ rpc: double.rpc })` installs it as `ctx.rpc`. */
  readonly rpc: PluginRpc
  /** The panel half: `createCommandClient(name, { backend: double.backend })`. */
  readonly backend: BridgeBackend
  /** Every invoke the panel made, in order, as the backend received it. */
  readonly calls: Array<{ method: string; args: unknown[] }>
  /** Stop the backend (calls in flight fail as the host fails them), or start it again. */
  setStopped(stopped: boolean): void
}

const NOT_RUNNING = 'Plugin backend is not running'
const STOPPED_MID_CALL = 'Plugin was stopped'
const ARGS_NOT_SERIALISABLE = 'Bridge args not serialisable for backend.invoke'

export function createRpcDouble(): RpcDouble {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const calls: RpcDouble['calls'] = []
  const stopListeners = new Set<() => void>()
  let stopped = false

  async function invoke(method: string, ...args: unknown[]): Promise<unknown> {
    if (stopped) throw new Error(NOT_RUNNING)
    const delivered = deliver(args)
    calls.push({ method, args: delivered })
    const handler = handlers.get(method)
    if (!handler) throw new Error(`No backend handler registered for '${method}'`)
    const result = await runUntilStopped(() => handler(...delivered), stopListeners)
    try {
      return jsonImage(result)
    } catch {
      throw new Error(HOST_NON_SERIALIZABLE_TEXT)
    }
  }

  return {
    rpc: {
      handle: (method, handler) => {
        handlers.set(method, handler)
      },
      removeHandler: (method) => {
        handlers.delete(method)
      },
    },
    backend: { invoke },
    calls,
    setStopped: (value) => {
      stopped = value
      if (value) for (const stop of [...stopListeners]) stop()
    },
  }
}

function deliver(args: unknown[]): unknown[] {
  try {
    return jsonImage(args) as unknown[]
  } catch {
    throw new Error(ARGS_NOT_SERIALISABLE)
  }
}

/** The handler's value, its error flattened to a message, or the host's "stopped" failure. */
async function runUntilStopped(call: () => unknown, stopListeners: Set<() => void>): Promise<unknown> {
  let onStop = (): void => {}
  const stoppedMidCall = new Promise<never>((_resolve, reject) => {
    onStop = () => reject(new Error(STOPPED_MID_CALL))
  })
  stopListeners.add(onStop)
  try {
    return await Promise.race([Promise.resolve().then(call), stoppedMidCall])
  } catch (err) {
    throw new Error(messageOf(err))
  } finally {
    stopListeners.delete(onStop)
  }
}
