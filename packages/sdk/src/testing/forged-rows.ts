/**
 * The forged-rows check: proof that a plugin acts ONLY on commands that come through its command
 * channel — never because a row in one of its tables says so.
 *
 * It is the test for the hole four store plugins shipped: a backend that ran every `pending` row
 * of a table an AI agent could write. The check:
 *
 * 1. starts the plugin and runs each command once through the channel (the positive control),
 *    failing unless the `effects` probe sees it — a probe that cannot see a command run could
 *    never see a forged one either;
 * 2. forges rows of every command type into every declared table, and edits and re-arms the rows
 *    the plugin wrote itself;
 * 3. fires everything that could drain a table — every cron, the start-up hooks, a second round
 *    of channel commands, and a full restart on the same data — and fails on any extra effect.
 *
 * It cannot advance time on its own: if your backend polls on a timer, pass a `settle` that does
 * (e.g. `() => vi.advanceTimersByTimeAsync(60_000)` under fake timers).
 */
import type { PluginActivate, PluginBackend } from '../types/backend.js'
import type { PluginContext } from '../types/context.js'
import { createCommandClient, type CommandClient, type CommandMap } from '../commands/client.js'
import { messageOf } from '../commands/protocol.js'
import { columnRoles, declaredTables } from '../validators/command-tables.js'
import { createRpcDouble } from './rpc-double.js'
// A cycle with ./index.js, which re-exports this module; safe because createTestContext is only
// called at run time, never while the modules load.
import { createTestContext, type TestContextOptions, type TestHarness } from './index.js'

export interface ForgedRowsOptions {
  /** The plugin's manifest.json. Rows are forged into every table it declares. */
  manifest: unknown
  /** The plugin's backend entry — the same `activate` Omniscio calls. */
  activate: PluginActivate
  /** The name the plugin passes to `createCommandChannel`. */
  channel: string
  /** One real input per command type: what the panel would send. */
  commands: Array<{ type: string; input: unknown }>
  /**
   * How many real effects the plugin has had so far — requests sent, sessions started, whatever
   * its commands do. Count them with the fakes you pass in `context` (e.g. a `fetch` spy).
   */
  effects: (harness: TestHarness) => number
  /** Options for each test context the check creates; put the fakes `effects` counts here. */
  context?: TestContextOptions
  /** Let time pass between steps. Defaults to one turn of the event loop. */
  settle?: () => Promise<void>
}

/** The `describe` / `it` of vitest or jest. */
export interface TestApi {
  describe(name: string, body: () => void): void
  it(name: string, body: () => Promise<void>): void
}

interface RunningPlugin {
  harness: TestHarness
  backend: PluginBackend
  crons: string[]
  client: CommandClient<CommandMap>
}

const FORGED_STATUSES = ['pending', 'queued']
/** Columns the host stamps on every row; a forged copy of a row must not carry them. */
const HOST_COLUMNS = new Set(['id', 'created_at', 'updated_at'])

export function describeForgedRowsAreInert(api: TestApi, options: ForgedRowsOptions): void {
  api.describe(`forged rows are inert (command channel "${options.channel}")`, () => {
    api.it('runs commands only through the channel, never from a forged, edited or re-armed row', () =>
      checkForgedRowsAreInert(options)
    )
  })
}

/** Resolves when the plugin is safe; rejects with an Error that says what ran and when. */
export async function checkForgedRowsAreInert(options: ForgedRowsOptions): Promise<void> {
  if (options.commands.length === 0) throw new Error('checkForgedRowsAreInert needs at least one command to run.')
  const settle = options.settle ?? nextTurn
  const plugin = await startPlugin(options, createTestContext({ ...options.context }), settle)
  const perCommand = await positiveControl(options, plugin, settle)
  await forgeRows(plugin.harness.ctx, options.manifest, options.commands)

  await expectNoEffects(options, plugin.harness, 'firing its crons and start-up hooks', async () => {
    await fireTriggers(plugin)
    await settle()
  })
  await secondRound(options, plugin, settle, perCommand)

  const restarted = createTestContext({ ...options.context })
  await copyData(plugin.harness.ctx, restarted.ctx, options.manifest)
  await expectNoEffects(options, restarted, 'restarting on the same data', async () => {
    await fireTriggers(await startPlugin(options, restarted, settle))
    await settle()
  })
}

async function startPlugin(options: ForgedRowsOptions, harness: TestHarness, settle: () => Promise<void>): Promise<RunningPlugin> {
  const rpc = createRpcDouble()
  harness.ctx.rpc = rpc.rpc
  const crons = recordCrons(harness.ctx)
  const backend = await options.activate(harness.ctx)
  await backend.onEnable?.()
  await backend.onAppReady?.()
  await settle()
  return { harness, backend, crons, client: createCommandClient(options.channel, { backend: rpc.backend }) }
}

function recordCrons(ctx: PluginContext): string[] {
  const ids: string[] = []
  const register = ctx.cron.register.bind(ctx.cron)
  ctx.cron.register = (id, schedule, handler) => {
    ids.push(id)
    return register(id, schedule, handler)
  }
  return ids
}

async function positiveControl(
  options: ForgedRowsOptions,
  plugin: RunningPlugin,
  settle: () => Promise<void>
): Promise<Map<string, number>> {
  const perCommand = new Map<string, number>()
  for (const { type, input } of options.commands) {
    const delta = await effectsOfRunning(options, plugin, settle, type, input)
    if (delta < 1) {
      throw new Error(
        `Positive control failed: running "${type}" through the channel changed effects() by ${delta}. ` +
          'The effects probe cannot see a command run, so it could never see a forged one either.'
      )
    }
    perCommand.set(type, delta)
  }
  return perCommand
}

async function secondRound(
  options: ForgedRowsOptions,
  plugin: RunningPlugin,
  settle: () => Promise<void>,
  perCommand: Map<string, number>
): Promise<void> {
  for (const { type, input } of options.commands) {
    const delta = await effectsOfRunning(options, plugin, settle, type, input)
    const expected = perCommand.get(type) ?? 0
    if (delta > expected) {
      throw new Error(
        `Forged rows ran: "${type}" through the channel caused ${delta} effect(s) after rows were forged, ` +
          `against ${expected} before. Something drains a table when a command arrives.`
      )
    }
  }
}

async function effectsOfRunning(
  options: ForgedRowsOptions,
  plugin: RunningPlugin,
  settle: () => Promise<void>,
  type: string,
  input: unknown
): Promise<number> {
  const before = options.effects(plugin.harness)
  try {
    await plugin.client.run(type, input)
  } catch (err) {
    throw new Error(`"${type}" did not run through the "${options.channel}" channel: ${messageOf(err)}`)
  }
  await settle()
  return options.effects(plugin.harness) - before
}

async function expectNoEffects(options: ForgedRowsOptions, harness: TestHarness, when: string, act: () => Promise<void>): Promise<void> {
  const before = options.effects(harness)
  await act()
  const extra = options.effects(harness) - before
  if (extra > 0) {
    throw new Error(
      `Forged rows ran: ${when} after rows were forged caused ${extra} effect(s). ` +
        'A row must never make the plugin act; take commands only through the channel.'
    )
  }
}

async function fireTriggers(plugin: RunningPlugin): Promise<void> {
  for (const id of new Set(plugin.crons)) {
    // A cron that throws on a forged row has refused it; only its effects are being measured.
    await plugin.harness.runCron(id).catch(() => undefined)
  }
  await plugin.backend.onAppReady?.()
}

/** Insert rows of every command type into every table, and edit and re-arm the existing ones. */
async function forgeRows(ctx: PluginContext, manifest: unknown, samples: ForgedRowsOptions['commands']): Promise<void> {
  for (const [table, schema] of declaredTables(manifest)) {
    const existing = await ctx.db.query(table)
    for (const [index, row] of existing.entries()) {
      await ctx.db.update(table, String(row.id), forgedFields(schema.columns, samples[index % samples.length]!, 'pending', false))
    }
    for (const sample of samples) {
      for (const status of FORGED_STATUSES) await ctx.db.insert(table, forgedFields(schema.columns, sample, status, true))
    }
  }
}

/** Command-shaped values in the columns whose names say instruction, argument or status. */
function forgedFields(
  columns: Record<string, unknown>,
  sample: ForgedRowsOptions['commands'][number],
  status: string,
  fillOthers: boolean
): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const [column, columnType] of Object.entries(columns)) {
    const roles = columnRoles(column)
    if (roles.status) fields[column] = status
    else if (roles.argument) fields[column] = columnType === 'json' ? sample.input : JSON.stringify(sample.input)
    else if (roles.instruction && columnType === 'text') fields[column] = sample.type
    else if (fillOthers) fields[column] = placeholder(columnType)
  }
  return fields
}

function placeholder(columnType: unknown): unknown {
  if (columnType === 'integer' || columnType === 'real') return 0
  return columnType === 'json' ? null : ''
}

async function copyData(from: PluginContext, to: PluginContext, manifest: unknown): Promise<void> {
  for (const [table] of declaredTables(manifest)) {
    for (const row of await from.db.query(table)) {
      await to.db.insert(table, Object.fromEntries(Object.entries(row).filter(([column]) => !HOST_COLUMNS.has(column))))
    }
  }
  for (const { key, value } of await from.storage.list()) await to.storage.set(key, value)
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
