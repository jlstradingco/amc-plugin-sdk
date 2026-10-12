/**
 * `createCommandChannel` — the backend half of a private command channel.
 *
 * A plugin acts only on commands that arrive through a door an AI agent cannot open: its own
 * panel (`AgentMC.backend.invoke` → `ctx.rpc`) or its own code (`submit`, e.g. from a
 * manifest-declared CLI action the host approves). The channel NEVER reads a table row as a
 * command, so a forged, edited or re-armed row does nothing.
 *
 * What it promises (each locked by a test in `__tests__/commands-channel.test.ts`):
 * - input is checked (JSON, size, the command's `parse`) before the command is accepted;
 * - write commands run one at a time, in arrival order; reads run alongside, up to a cap;
 * - an accepted command runs at most once, and its result is handed over exactly once;
 * - inputs and results are never logged and never written to tables;
 * - with `durable: true`, a command waiting at a restart resumes; one that had started never
 *   re-runs, because its private copy is deleted just before it runs;
 * - the queue, parallel reads, input size and uncollected results are all bounded.
 *
 * A command's `run` has no time limit: nothing can stop a running promise, so a timeout would
 * only break "one at a time". A stuck command keeps answering `pending` with a growing
 * `runningForMs`; restarting the plugin clears it.
 */
import type { PluginContext } from '../types/context.js'
import { CommandError } from './errors.js'
import {
  CHANNEL_NAME_PATTERN,
  COMMAND_TYPE_PATTERN,
  PROTOCOL_VERSION,
  jsonBytes,
  jsonImage,
  messageOf,
  settledResult,
  startMethod,
  statusMethod,
  type StartReply,
  type StatusReply,
} from './protocol.js'

export type CommandMode = 'read' | 'write'

/**
 * One command a channel accepts. `parse` runs BEFORE the command is accepted — throw to refuse
 * the input, and nothing is queued. Return the input you validated: `CommandMapOf` types the
 * panel's input from it. `run` does the work; its result must be plain JSON data.
 * `mode: 'write'` (the default) commands run one at a time in arrival order; `mode: 'read'`
 * commands may run alongside each other, up to `limits.maxParallelReads`.
 */
export interface CommandSpec<I = unknown, R = unknown> {
  mode?: CommandMode
  parse(input: unknown): I
  run(input: I): R | Promise<R>
}

/** Identity at runtime; it lets TypeScript type `run`'s input from what `parse` returns. */
export function defineCommand<I, R>(spec: CommandSpec<I, R>): CommandSpec<I, R> {
  return spec
}

// Each command has its own input and result types, so the record must accept any of them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandSpecs = Record<string, CommandSpec<any, any>>

/** What a command resolves to on the panel, after the JSON round trip. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandResult<C> = C extends CommandSpec<any, infer R> ? Awaited<R> : never

/** The panel's typed view of a channel: `createCommandClient<CommandMapOf<typeof commands>>(name)`. */
export type CommandMapOf<S extends CommandSpecs> = {
  [K in keyof S & string]: { input: ReturnType<S[K]['parse']>; result: CommandResult<S[K]> }
}

export interface CommandLimits {
  /** Commands accepted but not finished (waiting + running). Beyond it, new ones are refused. */
  maxQueued: number
  /** Read commands running at the same time. */
  maxParallelReads: number
  /** One command's input, as JSON bytes. Commands should carry ids, not documents. */
  maxInputBytes: number
  /** How long a finished command's result waits to be collected before it is dropped. */
  resultTtlMs: number
}

/** 50 keeps one panel's status calls under the host's cap of 100 calls in flight per plugin. */
export const DEFAULT_COMMAND_LIMITS: Readonly<CommandLimits> = {
  maxQueued: 50,
  maxParallelReads: 4,
  maxInputBytes: 64 * 1024,
  resultTtlMs: 10 * 60 * 1000,
}

export interface CommandChannelOptions<S extends CommandSpecs> {
  /** Lowercase letters, digits and dashes; it prefixes the channel's two ctx.rpc methods. */
  name: string
  commands: S
  /** Keep a private copy of each waiting command in `ctx.storage` (needs the `storage` permission). */
  durable?: boolean
  limits?: Partial<CommandLimits>
}

export interface RetireRowsOptions {
  /** Defaults to `'status'`. */
  statusColumn?: string
  /** The statuses that meant "still to run". Defaults to pending, queued and running. */
  activeStatuses?: string[]
  /** What a retired row's status becomes. Defaults to `'error'`. */
  retiredStatus?: string
  /** A text column that receives {@link RETIRED_ROW_NOTE}, if you have one. */
  noteColumn?: string
}

export interface CommandChannel<S extends CommandSpecs> {
  /** Run a command from your own backend code — same queue, checks and limits as the panel's. */
  submit<K extends keyof S & string>(type: K, input: unknown): Promise<CommandResult<S[K]>>
  /**
   * Settle every old row still marked to-run in a legacy command table, once, WITHOUT running it.
   * Call it at start-up: a row an agent re-arms later is settled again on the next start.
   * Returns how many rows it settled.
   */
  retireRows(collection: string, options?: RetireRowsOptions): Promise<number>
  /** Resolves once commands saved before a restart are queued again (at once when not durable). */
  readonly ready: Promise<void>
}

export const RETIRED_ROW_NOTE = 'Not run: this plugin no longer takes commands from this table.'

/** A status call waits this long for its command to finish before answering `pending`. */
const STATUS_WAIT_MS = 15_000
/** Finished results nobody collected, beyond this many, are dropped oldest first. */
const MAX_UNCLAIMED_RESULTS = 200
/** The host stores at most 1 MiB of JSON per value; a saved copy needs room for its envelope. */
const DURABLE_INPUT_MAX_BYTES = 1024 * 1024 - 1024
const DEFAULT_ACTIVE_STATUSES = ['pending', 'queued', 'running']

type Settled = 'done' | 'failed' | 'refused'

interface Entry {
  readonly id: string
  readonly type: string
  readonly mode: CommandMode
  readonly acceptedAt: number
  readonly settled: Promise<void>
  readonly markSettled: () => void
  input: unknown
  parsed: unknown
  state: 'queued' | 'running' | Settled
  startedAt: number
  settledAt: number
  result?: unknown
  message?: string
}

interface SavedCopy {
  type: string
  input?: unknown
  acceptedAt: number
  /** Arrival order within one run of the plugin: two commands can share a millisecond. */
  seq?: number
}

interface ChannelConfig {
  name: string
  commands: CommandSpecs
  durable: boolean
  limits: CommandLimits
}

const claimedNames = new WeakMap<object, Set<string>>()

export function createCommandChannel<S extends CommandSpecs>(
  ctx: PluginContext,
  options: CommandChannelOptions<S>
): CommandChannel<S> {
  const config = resolveConfig(options)
  claimName(ctx, config.name)
  const queue = new CommandQueue(ctx, config)
  openDoors(ctx, config.name, queue)
  return {
    submit: <K extends keyof S & string>(type: K, input: unknown) =>
      queue.submit(type, input) as Promise<CommandResult<S[K]>>,
    retireRows: (collection, retireOptions) => retireRows(ctx, collection, retireOptions),
    ready: queue.ready,
  }
}

function resolveConfig(options: CommandChannelOptions<CommandSpecs>): ChannelConfig {
  const { name, commands, durable = false } = options
  if (typeof name !== 'string' || !CHANNEL_NAME_PATTERN.test(name)) {
    throw new Error(`createCommandChannel: name "${String(name)}" must match ${CHANNEL_NAME_PATTERN}`)
  }
  for (const [type, spec] of Object.entries(commands ?? {})) {
    if (!COMMAND_TYPE_PATTERN.test(type)) {
      throw new Error(`createCommandChannel: command type "${type}" must match ${COMMAND_TYPE_PATTERN}`)
    }
    if (typeof spec?.parse !== 'function' || typeof spec.run !== 'function') {
      throw new Error(`createCommandChannel: command "${type}" needs a parse and a run function`)
    }
  }
  return { name, commands, durable, limits: resolveLimits(options.limits, durable) }
}

function resolveLimits(overrides: Partial<CommandLimits> | undefined, durable: boolean): CommandLimits {
  const limits = { ...DEFAULT_COMMAND_LIMITS, ...overrides }
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`createCommandChannel: limits.${key} must be a positive whole number`)
    }
  }
  if (durable && limits.maxInputBytes > DURABLE_INPUT_MAX_BYTES) {
    throw new Error(
      `createCommandChannel: a durable channel's limits.maxInputBytes can be at most ` +
        `${DURABLE_INPUT_MAX_BYTES} (Omniscio stores at most 1 MiB per value)`
    )
  }
  return limits
}

/** Two channels with one name would both resume the same saved commands — twice the run. */
function claimName(ctx: object, name: string): void {
  const names = claimedNames.get(ctx) ?? new Set<string>()
  if (names.has(name)) {
    throw new Error(`createCommandChannel: this plugin already has a channel named "${name}"`)
  }
  names.add(name)
  claimedNames.set(ctx, names)
}

function openDoors(ctx: PluginContext, name: string, queue: CommandQueue): void {
  const rpc = ctx.rpc
  if (typeof rpc?.handle !== 'function') {
    ctx.log.warn(
      `[commands] ${name}: this Omniscio has no panel-to-backend channel (ctx.rpc arrived in ` +
        `v0.1.92), so the panel cannot send commands until Omniscio is updated.`
    )
    return
  }
  rpc.handle(startMethod(name), (request) => answerStart(queue, request))
  rpc.handle(statusMethod(name), (request) => answerStatus(queue, request))
}

async function answerStart(queue: CommandQueue, request: unknown): Promise<StartReply> {
  if (!isRequest(request)) {
    return { ok: false, code: 'refused', message: 'This panel and backend are different versions. Reload the plugin.' }
  }
  try {
    return { ok: true, id: await queue.accept(request.type, request.input) }
  } catch (err) {
    if (err instanceof CommandError && (err.code === 'invalid-input' || err.code === 'refused')) {
      return { ok: false, code: err.code, message: err.message }
    }
    throw err
  }
}

async function answerStatus(queue: CommandQueue, request: unknown): Promise<StatusReply> {
  if (!isRequest(request) || typeof request.id !== 'string') return { state: 'unknown' }
  return queue.status(request.id)
}

function isRequest(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && (value as { v?: unknown }).v === PROTOCOL_VERSION
}

async function retireRows(ctx: PluginContext, collection: string, options: RetireRowsOptions = {}): Promise<number> {
  const { statusColumn = 'status', activeStatuses = DEFAULT_ACTIVE_STATUSES, retiredStatus = 'error' } = options
  const note = options.noteColumn ? { [options.noteColumn]: RETIRED_ROW_NOTE } : {}
  let retired = 0
  for (const status of activeStatuses) {
    for (const row of await ctx.db.query(collection, { where: { [statusColumn]: status } })) {
      await ctx.db.update(collection, String(row.id), { [statusColumn]: retiredStatus, ...note })
      retired++
    }
  }
  return retired
}

class CommandQueue {
  readonly ready: Promise<void>
  private readonly entries = new Map<string, Entry>()
  private readonly waitingWrites: Entry[] = []
  private readonly waitingReads: Entry[] = []
  private readonly runningReads = new Set<Entry>()
  private runningWrite: Entry | undefined
  private savedCopiesUnreadable = false
  private nextSeq = 0

  constructor(
    private readonly ctx: PluginContext,
    private readonly config: ChannelConfig
  ) {
    this.ready = config.durable ? this.recover() : Promise.resolve()
  }

  async accept(type: unknown, rawInput: unknown): Promise<string> {
    await this.ready
    if (this.savedCopiesUnreadable) {
      throw new CommandError('refused', 'Saved commands could not be read, so this channel is closed until the plugin restarts.')
    }
    const spec = this.specFor(type)
    const input = this.checkedInput(rawInput)
    this.checkCapacity()
    const parsed = parseOrRefuse(spec, input)
    const entry = this.addEntry(String(type), spec, input, parsed)
    await this.saveCopy(entry)
    this.enqueue(entry)
    return entry.id
  }

  async submit(type: string, input: unknown): Promise<unknown> {
    const id = await this.accept(type, input)
    await this.entries.get(id)?.settled
    const reply = this.take(id)
    if (reply.state === 'pending') throw new CommandError('outcome-unknown', 'The command result was lost.')
    return settledResult(reply)
  }

  async status(id: string): Promise<StatusReply> {
    this.dropExpired()
    const entry = this.entries.get(id)
    if (!entry) return { state: 'unknown' }
    if (!isSettled(entry)) await settledOrTimeout(entry.settled, STATUS_WAIT_MS)
    return this.take(id)
  }

  /** Hand a settled result over exactly once; a second ask finds nothing. */
  private take(id: string): StatusReply {
    const entry = this.entries.get(id)
    if (!entry) return { state: 'unknown' }
    if (entry.state === 'queued' || entry.state === 'running') return this.pendingReply(entry)
    this.entries.delete(id)
    if (entry.state === 'done') return entry.result === undefined ? { state: 'done' } : { state: 'done', result: entry.result }
    return { state: entry.state, message: entry.message ?? '' }
  }

  private pendingReply(entry: Entry): StatusReply {
    const now = Date.now()
    if (entry.state === 'running') return { state: 'pending', waiting: 'running', runningForMs: now - entry.startedAt }
    const ahead = entry.mode === 'write' ? this.runningWrite : longestRunning(this.runningReads)
    return { state: 'pending', waiting: 'queued', runningForMs: ahead ? now - ahead.startedAt : 0 }
  }

  private specFor(type: unknown): CommandSpecs[string] {
    const spec = ownSpec(this.config.commands, type)
    if (spec) return spec
    throw new CommandError('invalid-input', `"${String(type)}" is not a command this channel accepts.`)
  }

  private checkedInput(raw: unknown): unknown {
    let input: unknown
    try {
      input = jsonImage(raw)
    } catch {
      throw new CommandError('invalid-input', 'A command input must be plain JSON data.')
    }
    const bytes = jsonBytes(input)
    const max = this.config.limits.maxInputBytes
    if (bytes > max) {
      throw new CommandError('refused', `The command input is ${bytes} bytes, over this channel's ${max}-byte limit. Send an id, not a document.`)
    }
    return input
  }

  private checkCapacity(): void {
    let active = 0
    for (const entry of this.entries.values()) if (!isSettled(entry)) active++
    if (active >= this.config.limits.maxQueued) {
      throw new CommandError('refused', `${active} commands are already waiting or running. Try again when they finish.`)
    }
  }

  private addEntry(
    type: string,
    spec: CommandSpecs[string],
    input: unknown,
    parsed: unknown,
    id: string = crypto.randomUUID(),
    acceptedAt: number = Date.now()
  ): Entry {
    let markSettled = (): void => {}
    const settled = new Promise<void>((resolve) => {
      markSettled = resolve
    })
    const entry: Entry = { id, type, mode: spec.mode ?? 'write', acceptedAt, settled, markSettled, input, parsed, state: 'queued', startedAt: 0, settledAt: 0 }
    this.entries.set(id, entry)
    return entry
  }

  private enqueue(entry: Entry): void {
    ;(entry.mode === 'read' ? this.waitingReads : this.waitingWrites).push(entry)
    this.pump()
  }

  private pump(): void {
    while (this.runningReads.size < this.config.limits.maxParallelReads && this.waitingReads.length > 0) {
      const entry = this.waitingReads.shift()!
      this.runningReads.add(entry)
      void this.execute(entry).finally(() => {
        this.runningReads.delete(entry)
        this.pump()
      })
    }
    if (this.runningWrite === undefined && this.waitingWrites.length > 0) {
      const entry = this.waitingWrites.shift()!
      this.runningWrite = entry
      void this.execute(entry).finally(() => {
        this.runningWrite = undefined
        this.pump()
      })
    }
  }

  /** Never rejects: every outcome settles the entry. */
  private async execute(entry: Entry): Promise<void> {
    entry.state = 'running'
    entry.startedAt = Date.now()
    const claim = await this.claimCopy(entry)
    if (claim !== 'claimed') return this.settle(entry, 'refused', undefined, CLAIM_REFUSALS[claim])
    let result: unknown
    try {
      result = await this.config.commands[entry.type]!.run(entry.parsed)
    } catch (err) {
      this.ctx.log.warn(`[commands] ${this.config.name}: "${entry.type}" failed (${entry.id})`)
      return this.settle(entry, 'failed', undefined, messageOf(err))
    }
    let image: unknown
    try {
      image = jsonImage(result)
    } catch {
      return this.settle(entry, 'failed', undefined, `"${entry.type}" ran, but its result is not plain JSON data, so it could not be sent back.`)
    }
    this.settle(entry, 'done', image)
  }

  private settle(entry: Entry, state: Settled, result?: unknown, message?: string): void {
    entry.state = state
    entry.result = result
    entry.message = message
    entry.settledAt = Date.now()
    entry.input = undefined
    entry.parsed = undefined
    entry.markSettled()
    this.dropOldestUncollected()
  }

  private dropExpired(): void {
    const cutoff = Date.now() - this.config.limits.resultTtlMs
    for (const [id, entry] of this.entries) if (isSettled(entry) && entry.settledAt < cutoff) this.entries.delete(id)
  }

  private dropOldestUncollected(): void {
    let excess = [...this.entries.values()].filter(isSettled).length - MAX_UNCLAIMED_RESULTS
    for (const [id, entry] of this.entries) {
      if (excess <= 0) return
      if (isSettled(entry)) {
        this.entries.delete(id)
        excess--
      }
    }
  }

  // ── durable: the private copy in ctx.storage ────────────────────────────────

  private copyKey(id: string): string {
    return `__commands:${this.config.name}:${id}`
  }

  private async saveCopy(entry: Entry): Promise<void> {
    if (!this.config.durable) return
    const copy: SavedCopy = { type: entry.type, input: entry.input, acceptedAt: entry.acceptedAt, seq: this.nextSeq++ }
    try {
      await this.ctx.storage.set(this.copyKey(entry.id), copy)
    } catch {
      this.entries.delete(entry.id)
      throw new CommandError('refused', 'The command could not be saved, so it was not queued.')
    }
  }

  /** Delete the private copy BEFORE running: a crash mid-run can then never run it again. */
  private async claimCopy(entry: Entry): Promise<'claimed' | 'missing' | 'stuck'> {
    if (!this.config.durable) return 'claimed'
    const key = this.copyKey(entry.id)
    try {
      const copy = await this.ctx.storage.get(key)
      if (copy === undefined || copy === null) return 'missing'
      await this.ctx.storage.delete(key)
      return 'claimed'
    } catch {
      return 'stuck'
    }
  }

  private async recover(): Promise<void> {
    let saved: Array<{ key: string; value: unknown }>
    try {
      saved = await this.ctx.storage.list(this.copyKey(''))
    } catch {
      this.savedCopiesUnreadable = true
      this.ctx.log.error(`[commands] ${this.config.name}: saved commands could not be read; the channel refuses commands until the plugin restarts.`)
      return
    }
    for (const { key, value } of sortByArrival(saved)) await this.requeue(key, value)
  }

  private async requeue(key: string, value: unknown): Promise<void> {
    const id = key.slice(this.copyKey('').length)
    const copy = asSavedCopy(value)
    const spec = copy ? ownSpec(this.config.commands, copy.type) : undefined
    if (!copy || !spec) return this.dropCopy(key, id, 'unreadable')
    let parsed: unknown
    try {
      parsed = spec.parse(copy.input)
    } catch {
      return this.dropCopy(key, id, 'no longer valid')
    }
    this.enqueue(this.addEntry(copy.type, spec, copy.input, parsed, id, copy.acceptedAt))
  }

  private async dropCopy(key: string, id: string, why: string): Promise<void> {
    this.ctx.log.warn(`[commands] ${this.config.name}: saved command ${id} is ${why}; dropped without running.`)
    try {
      await this.ctx.storage.delete(key)
    } catch {
      this.ctx.log.warn(`[commands] ${this.config.name}: could not delete saved command ${id}; it is dropped again at the next start.`)
    }
  }
}

const CLAIM_REFUSALS = {
  missing: 'Its saved copy is gone, so it was not run.',
  stuck: 'Its saved copy could not be cleared, so it was not run.',
} as const

function ownSpec(commands: CommandSpecs, type: unknown): CommandSpecs[string] | undefined {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(commands, type) ? commands[type] : undefined
}

function parseOrRefuse(spec: CommandSpecs[string], input: unknown): unknown {
  try {
    return spec.parse(input)
  } catch (err) {
    throw new CommandError('invalid-input', messageOf(err))
  }
}

function isSettled(entry: Entry): boolean {
  return entry.state === 'done' || entry.state === 'failed' || entry.state === 'refused'
}

function longestRunning(entries: Set<Entry>): Entry | undefined {
  let oldest: Entry | undefined
  for (const entry of entries) if (!oldest || entry.startedAt < oldest.startedAt) oldest = entry
  return oldest
}

function asSavedCopy(value: unknown): SavedCopy | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const copy = value as Partial<SavedCopy>
  return typeof copy.type === 'string' && typeof copy.acceptedAt === 'number' ? (copy as SavedCopy) : undefined
}

/** Arrival order: by time, then by sequence for commands that arrived in the same millisecond. */
function sortByArrival(saved: Array<{ key: string; value: unknown }>): Array<{ key: string; value: unknown }> {
  const at = (value: unknown): number => asSavedCopy(value)?.acceptedAt ?? 0
  const seq = (value: unknown): number => asSavedCopy(value)?.seq ?? 0
  return [...saved].sort((a, b) => at(a.value) - at(b.value) || seq(a.value) - seq(b.value) || a.key.localeCompare(b.key))
}

function settledOrTimeout(settled: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  return Promise.race([settled, timeout]).finally(() => clearTimeout(timer))
}
