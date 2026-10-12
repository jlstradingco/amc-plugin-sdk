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
 * - inputs and results are never logged and never written to tables or to storage;
 * - commands live only in memory: the channel never reads or writes `ctx.storage`, which AI agents
 *   on the person's computer can read and write, so a restart drops the commands that were
 *   waiting, none of them runs later, and a panel still waiting hears `outcome-unknown`;
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
   * It reads page after page, however many rows there are. Rows that do not change when retired
   * are left for the next start with one warning, so it can never loop forever.
   * Returns how many rows it settled.
   */
  retireRows(collection: string, options?: RetireRowsOptions): Promise<number>
}

export const RETIRED_ROW_NOTE = 'Not run: this plugin no longer takes commands from this table.'

/** A status call waits this long for its command to finish before answering `pending`. */
const STATUS_WAIT_MS = 15_000
/** Finished results nobody collected, beyond this many, are dropped oldest first. */
const MAX_UNCLAIMED_RESULTS = 200
const DEFAULT_ACTIVE_STATUSES = ['pending', 'queued', 'running']
/** Rows retireRows reads at a time: Omniscio's own default page. */
const RETIRE_PAGE = 100
/** One read counts what a stalled retire left behind; Omniscio caps any page at 10,000 rows. */
const COUNT_PAGE = 10_000

type Settled = 'done' | 'failed'

interface Entry {
  readonly id: string
  readonly type: string
  readonly mode: CommandMode
  readonly settled: Promise<void>
  readonly markSettled: () => void
  parsed: unknown
  state: 'queued' | 'running' | Settled
  startedAt: number
  settledAt: number
  result?: unknown
  message?: string
}

interface ChannelConfig {
  name: string
  commands: CommandSpecs
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
  }
}

function resolveConfig(options: CommandChannelOptions<CommandSpecs>): ChannelConfig {
  const { name, commands } = options
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
  return { name, commands, limits: resolveLimits(options.limits) }
}

function resolveLimits(overrides: Partial<CommandLimits> | undefined): CommandLimits {
  const limits = { ...DEFAULT_COMMAND_LIMITS, ...overrides }
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`createCommandChannel: limits.${key} must be a positive whole number`)
    }
  }
  return limits
}

/** Two channels with one name would fight over the same two ctx.rpc methods. */
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
  if (activeStatuses.includes(retiredStatus)) {
    throw new Error(
      `retireRows: retiredStatus "${retiredStatus}" is one of the activeStatuses, so a retired row would still look to-run`
    )
  }
  const note = options.noteColumn ? { [options.noteColumn]: RETIRED_ROW_NOTE } : {}
  const update = { [statusColumn]: retiredStatus, ...note }
  let retired = 0
  let left = 0
  for (const status of activeStatuses) {
    const where = { [statusColumn]: status }
    const outcome = await retireStatus(ctx, collection, where, update)
    retired += outcome.retired
    if (outcome.stalled) left += (await ctx.db.query(collection, { where, limit: COUNT_PAGE })).length
  }
  if (left > 0) {
    ctx.log.warn(
      `[commands] retireRows: ${left} rows in "${collection}" are still marked to run after being retired; ` +
        'the next start settles them again.'
    )
  }
  return retired
}

/**
 * Retire the rows matching `where`, re-reading the first page until it comes back short: each
 * update moves a row out of `where`, so an offset would skip rows. A page with nothing new means
 * the rows are not changing (an agent re-arming them as fast as they go), so it stops there.
 */
async function retireStatus(
  ctx: PluginContext,
  collection: string,
  where: Record<string, unknown>,
  update: Record<string, unknown>
): Promise<{ retired: number; stalled: boolean }> {
  const seen = new Set<string>()
  for (;;) {
    const page = await ctx.db.query(collection, { where, limit: RETIRE_PAGE })
    const fresh = page.filter((row) => !seen.has(String(row.id)))
    for (const row of fresh) {
      seen.add(String(row.id))
      await ctx.db.update(collection, String(row.id), update)
    }
    if (page.length < RETIRE_PAGE) return { retired: seen.size, stalled: fresh.length < page.length }
    if (fresh.length === 0) return { retired: seen.size, stalled: true }
  }
}

class CommandQueue {
  private readonly entries = new Map<string, Entry>()
  private readonly waitingWrites: Entry[] = []
  private readonly waitingReads: Entry[] = []
  private readonly runningReads = new Set<Entry>()
  private runningWrite: Entry | undefined

  constructor(
    private readonly ctx: PluginContext,
    private readonly config: ChannelConfig
  ) {}

  async accept(type: unknown, rawInput: unknown): Promise<string> {
    const spec = this.specFor(type)
    const input = this.checkedInput(rawInput)
    this.checkCapacity()
    const parsed = parseOrRefuse(spec, input)
    const entry = this.addEntry(String(type), spec.mode ?? 'write', parsed)
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
      throw new CommandError(
        'refused',
        `The command input is ${bytes} bytes, over this channel's ${max}-byte limit. Send an id, not a document.`
      )
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

  private addEntry(type: string, mode: CommandMode, parsed: unknown): Entry {
    let markSettled = (): void => {}
    const settled = new Promise<void>((resolve) => {
      markSettled = resolve
    })
    const id = crypto.randomUUID()
    const entry: Entry = { id, type, mode, settled, markSettled, parsed, state: 'queued', startedAt: 0, settledAt: 0 }
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
      const message = `"${entry.type}" ran, but its result is not plain JSON data, so it could not be sent back.`
      return this.settle(entry, 'failed', undefined, message)
    }
    this.settle(entry, 'done', image)
  }

  private settle(entry: Entry, state: Settled, result?: unknown, message?: string): void {
    entry.state = state
    entry.result = result
    entry.message = message
    entry.settledAt = Date.now()
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
}

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
  return entry.state === 'done' || entry.state === 'failed'
}

function longestRunning(entries: Set<Entry>): Entry | undefined {
  let oldest: Entry | undefined
  for (const entry of entries) if (!oldest || entry.startedAt < oldest.startedAt) oldest = entry
  return oldest
}

function settledOrTimeout(settled: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  return Promise.race([settled, timeout]).finally(() => clearTimeout(timer))
}
