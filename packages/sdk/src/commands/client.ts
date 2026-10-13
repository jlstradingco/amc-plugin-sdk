/**
 * `createCommandClient` — the panel half of a private command channel.
 *
 * `run(type, input)` starts the command on the backend's channel and waits for its result. It
 * never writes a table row, never touches storage, and never re-sends a command on its own: when
 * it cannot tell whether a command ran, it says so (`outcome-unknown`) rather than guessing.
 *
 * Browser-safe: it imports nothing but its two sibling modules, so a plugin can bundle it or load
 * the three built files as plain ES modules.
 */
import type { BridgeBackend } from '../types/bridge.js'
import { CommandError } from './errors.js'
import {
  HOST_BUSY_TEXT,
  HOST_NOT_DELIVERED_TEXTS,
  PROTOCOL_VERSION,
  messageOf,
  settledResult,
  startMethod,
  statusMethod,
  type StatusReply,
} from './protocol.js'

/** The input and result type of each command, e.g. `CommandMapOf<typeof commands>`. */
export type CommandMap = Record<string, { input: unknown; result: unknown }>

export interface PendingStatus {
  /** `'running'`: this command is running now. `'queued'`: it waits behind an earlier one. */
  waiting: 'queued' | 'running'
  /**
   * How long the command holding this one's place has been running: this command's own time once
   * it runs, otherwise the one ahead of it. A number that keeps growing means a stuck command;
   * restarting the plugin clears it.
   */
  runningForMs: number
}

export interface RunOptions {
  /** Called each time the backend reports the command still pending, about every 15 seconds. */
  onPending?: (status: PendingStatus) => void
}

export interface CommandClientOptions {
  /** Defaults to `window.AgentMC.backend`, read each time a command runs. Tests pass a double. */
  backend?: BridgeBackend
}

export interface CommandClient<M extends CommandMap> {
  run<K extends keyof M & string>(type: K, input: M[K]['input'], options?: RunOptions): Promise<M[K]['result']>
}

const HOST_TOO_OLD = 'This version of Omniscio is too old for this plugin. Update Omniscio, then open the plugin again.'
const WORKER_NOT_READY = "The plugin's background service is not running. Reload the plugin and try again."
const HOST_BUSY = "Omniscio is still busy with this plugin's earlier requests. Try again in a moment."
const OUTCOME_UNKNOWN = "Lost contact with the plugin's background service. The command may or may not have run."
const NOT_JSON = 'A command input must be plain JSON data.'
/** Pause between status calls, so a fast `pending` answer cannot become a busy loop. */
const POLL_GAP_MS = 250
/** How long to keep asking while the backend is unreachable (a restart takes seconds). */
const RECONNECT_WINDOW_MS = 60_000
const RECONNECT_GAP_MS = 2_000
const SETTLED_STATES = new Set(['done', 'failed', 'refused', 'unknown'])

export function createCommandClient<M extends CommandMap = CommandMap>(
  name: string,
  options: CommandClientOptions = {}
): CommandClient<M> {
  return {
    async run<K extends keyof M & string>(type: K, input: M[K]['input'], runOptions: RunOptions = {}) {
      const backend = options.backend ?? defaultBackend()
      if (typeof backend?.invoke !== 'function') throw new CommandError('host-too-old', HOST_TOO_OLD)
      assertJson(input)
      const id = await start(backend, name, type, input)
      return (await awaitResult(backend, name, id, runOptions.onPending)) as M[K]['result']
    },
  }
}

function defaultBackend(): BridgeBackend | undefined {
  return (globalThis as { AgentMC?: { backend?: BridgeBackend } }).AgentMC?.backend
}

function assertJson(input: unknown): void {
  try {
    JSON.stringify(input)
  } catch {
    throw new CommandError('invalid-input', NOT_JSON)
  }
}

async function start(backend: BridgeBackend, name: string, type: string, input: unknown): Promise<string> {
  let reply: unknown
  try {
    reply = await backend.invoke(startMethod(name), { v: PROTOCOL_VERSION, type, input })
  } catch (err) {
    throw startFailure(messageOf(err))
  }
  if (isRecord(reply) && reply.ok === true && typeof reply.id === 'string') return reply.id
  if (isRecord(reply) && reply.ok === false && (reply.code === 'invalid-input' || reply.code === 'refused')) {
    throw new CommandError(reply.code, String(reply.message ?? ''))
  }
  throw new CommandError('outcome-unknown', OUTCOME_UNKNOWN)
}

/** Only a failure the host raises BEFORE delivering may say "nothing ran". */
function startFailure(message: string): CommandError {
  if (message.includes(HOST_BUSY_TEXT)) return new CommandError('refused', HOST_BUSY)
  if (HOST_NOT_DELIVERED_TEXTS.some((text) => message.includes(text))) {
    return new CommandError('worker-not-ready', WORKER_NOT_READY)
  }
  return new CommandError('outcome-unknown', OUTCOME_UNKNOWN)
}

async function awaitResult(
  backend: BridgeBackend,
  name: string,
  id: string,
  onPending: RunOptions['onPending']
): Promise<unknown> {
  for (;;) {
    const reply = await askStatus(backend, name, id)
    if (reply.state !== 'pending') return settledResult(reply)
    onPending?.({ waiting: reply.waiting, runningForMs: reply.runningForMs })
    await new Promise((resolve) => setTimeout(resolve, POLL_GAP_MS))
  }
}

/**
 * Ask until the backend answers. A failed call usually means the backend is briefly unreachable
 * or restarting; asking again cannot run anything, and the command may still finish if the
 * backend comes back without a restart, so the client keeps asking for
 * {@link RECONNECT_WINDOW_MS} before it calls the outcome unknown. A restarted backend no longer
 * knows the command and answers `unknown` at once.
 */
async function askStatus(backend: BridgeBackend, name: string, id: string): Promise<StatusReply> {
  const giveUpAt = Date.now() + RECONNECT_WINDOW_MS
  for (;;) {
    let reply: unknown
    try {
      reply = await backend.invoke(statusMethod(name), { v: PROTOCOL_VERSION, id })
    } catch {
      if (Date.now() >= giveUpAt) throw new CommandError('outcome-unknown', OUTCOME_UNKNOWN)
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_GAP_MS))
      continue
    }
    if (!isStatusReply(reply)) throw new CommandError('outcome-unknown', OUTCOME_UNKNOWN)
    return reply
  }
}

function isStatusReply(value: unknown): value is StatusReply {
  if (!isRecord(value)) return false
  if (value.state === 'pending') {
    return (value.waiting === 'queued' || value.waiting === 'running') && typeof value.runningForMs === 'number'
  }
  return typeof value.state === 'string' && SETTLED_STATES.has(value.state)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
