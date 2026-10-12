/**
 * The wire between `createCommandClient` (a plugin's panel) and `createCommandChannel` (its
 * backend), plus the host facts both halves depend on.
 *
 * Both halves import this one module, so a method name or an envelope shape cannot drift
 * between them. Everything here crosses the host's JSON boundary: the plugin worker is forked
 * with Node's default `json` IPC serialization, so arguments and return values arrive as their
 * `JSON.parse(JSON.stringify(x))` image.
 *
 * Browser-safe on purpose — no `node:` import and no dependency — because the client half runs
 * in a plugin's webview.
 */
import { CommandError } from './errors.js'

/** Bumped only by an incompatible change to the envelopes below. */
export const PROTOCOL_VERSION = 1

/** A channel name. It prefixes the two ctx.rpc methods the channel registers. */
export const CHANNEL_NAME_PATTERN = /^[a-z][a-z0-9-]{0,39}$/

/** A command type: a key of the channel's `commands` object. */
export const COMMAND_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/

export const startMethod = (name: string): string => `${name}:cmd.start`
export const statusMethod = (name: string): string => `${name}:cmd.status`

/** A refusal is an answer, not a thrown error: the host would flatten a throw to its message. */
export type StartReply =
  | { ok: true; id: string }
  | { ok: false; code: 'invalid-input' | 'refused'; message: string }

/**
 * `pending` says where the command stands: `waiting: 'running'` means it is running now and
 * `runningForMs` is its own running time; `waiting: 'queued'` means it waits behind an earlier
 * command and `runningForMs` is how long THAT one has been running (0 when nothing is). A
 * number that keeps growing is a stuck command, cleared only by restarting the plugin.
 *
 * `done`, `failed` and `refused` are handed over exactly once; asking again answers `unknown`,
 * as does an id this backend never accepted, one that expired uncollected, or one lost in a
 * restart. `refused` after acceptance means it was never run (its saved copy was gone).
 */
export type StatusReply =
  | { state: 'pending'; waiting: 'queued' | 'running'; runningForMs: number }
  | { state: 'done'; result?: unknown }
  | { state: 'failed'; message: string }
  | { state: 'refused'; message: string }
  | { state: 'unknown' }

const UNKNOWN_OUTCOME =
  'The plugin no longer knows this command: it may have run before a restart, or its result was ' +
  'already collected or expired.'

/** A settled status as the command's result — or the CommandError that says why there is none. */
export function settledResult(reply: Exclude<StatusReply, { state: 'pending' }>): unknown {
  switch (reply.state) {
    case 'done':
      return reply.result
    case 'failed':
      throw new CommandError('failed', reply.message)
    case 'refused':
      throw new CommandError('refused', reply.message)
    default:
      throw new CommandError('outcome-unknown', UNKNOWN_OUTCOME)
  }
}

/**
 * What Omniscio's host rejects a `backend.invoke` with when the call never reached a handler,
 * read from host master 8d41f0cdf6 (plugin-worker-host.ts dispatchInvoke, the `backend` case of
 * plugin-bridge-handler.ts, plugin-worker-entry-helpers.ts createRpcBridge). The host sends no
 * error codes, so these texts are the only signal; `__tests__/fixtures/host-mirror.ts` pins the
 * full strings with their source lines.
 */
export const HOST_NOT_DELIVERED_TEXTS = [
  'Plugin backend is not running',
  'plugin runtime is not ready',
  'has no running backend to invoke',
  'No backend handler registered for',
] as const

/** The host's per-plugin in-flight cap refused the call before forwarding it. */
export const HOST_BUSY_TEXT = 'Too many in-flight backend calls'

/** What the host answers when a handler's return value cannot be serialized. */
export const HOST_NON_SERIALIZABLE_TEXT = 'Plugin backend returned a non-serializable value'

/** The value as it arrives on the far side of the host's JSON boundary. Throws for a BigInt or a cycle. */
export function jsonImage(value: unknown): unknown {
  const text = JSON.stringify(value)
  return text === undefined ? undefined : JSON.parse(text)
}

/** Bytes of the value's JSON text — the quantity the host's storage cap measures. */
export function jsonBytes(value: unknown): number {
  const text = JSON.stringify(value)
  return text === undefined ? 0 : new TextEncoder().encode(text).length
}

/** A thrown value's message, the way the host flattens it. */
export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
