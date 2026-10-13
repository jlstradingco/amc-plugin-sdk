/**
 * The ship check's rule: does a plugin's manifest declare a table that can hold a runnable
 * command — rows an AI agent on the person's computer could write or re-arm to make the
 * plugin's backend act?
 *
 * Four of Edo's plugins shipped exactly that shape: a table with an instruction column
 * (`type`), an argument column (`payload` / `payloadJson`) and a status column, drained by a
 * backend that ran every `pending` row. This rule blocks that shape and warns on fuzzier ones.
 *
 * It is ONE pure function that reads only the manifest, so `amc-plugin validate`, `preflight`,
 * `publish` and — if it adopts the function — the marketplace all give the same answer. It is
 * the second line of defence: it cannot see code, a JSON blob hiding the shape, dynamic table
 * names, or anyone who never runs the CLI. Omniscio's own fence (`agentWritable`) is the first.
 */

export const COMMAND_TABLE_WAIVER_MIN_CHARS = 20
export const COMMAND_TABLE_WAIVER_MAX_CHARS = 500

/** Any of these words in a column name: the column picks WHAT to do. */
const INSTRUCTION_WORDS = new Set(['type', 'command', 'cmd', 'action', 'op', 'operation', 'kind', 'method', 'verb'])
/** The last word of a column name: the column carries what to do it WITH. */
const ARGUMENT_WORDS = new Set(['payload', 'args', 'arguments', 'params', 'parameters', 'input', 'inputs', 'body', 'data', 'prompt'])
/** The last word of a column name: the column tracks progress — what an agent re-arms. */
const STATUS_WORDS = new Set(['status', 'state'])
/** The last word of a column name: the column is itself an instruction, in prose. */
const PROMPT_WORDS = new Set(['prompt', 'prompts', 'instruction', 'instructions', 'script'])
/** Any of these words in a table name: the table holds work waiting to be done. */
const QUEUE_WORDS = new Set([
  'queue', 'queues', 'queued', 'job', 'jobs', 'command', 'commands', 'cmd', 'cmds', 'action', 'actions', 'outbox',
])
/** Trailing words that only name an encoding, so `payloadJson` reads as `payload`. */
const ENCODING_WORDS = new Set(['json', 'text', 'raw', 'str', 'blob', 'b64', 'base64'])

export type CommandTableFindingKind =
  | 'command-table'
  | 'prompt-with-status'
  | 'queue-like-table'
  | 'agent-writable-status'

export interface CommandTableFinding {
  table: string
  kind: CommandTableFindingKind
  /** The columns that matched, in declaration order. */
  columns: string[]
  message: string
}

export interface CommandTableReport {
  /** Tables that fail `validate`, `preflight` and `publish`. */
  blocking: CommandTableFinding[]
  /** Fuzzier shapes worth a second look. They never fail a check. */
  warnings: CommandTableFinding[]
  /** Command-shaped tables a written waiver let through, listed so reviewers see them. */
  waived: Array<CommandTableFinding & { waiver: string }>
}

export interface ColumnRoles {
  instruction: boolean
  argument: boolean
  status: boolean
  prompt: boolean
}

export interface TableSchema {
  columns: Record<string, unknown>
  agentWritable?: unknown
  commandTableWaiver?: unknown
}

interface TableShape {
  instruction: string[]
  argument: string[]
  status: string[]
  prompt: string[]
}

/** `payloadJson`, `payload_json` and `payload-json` all read as `['payload', 'json']`. */
export function nameWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** What a column's NAME says it does. Shared with the testing kit, which forges rows by it. */
export function columnRoles(name: string): ColumnRoles {
  const words = nameWords(name)
  while (words.length > 1 && ENCODING_WORDS.has(words[words.length - 1]!)) words.pop()
  const last = words[words.length - 1] ?? ''
  return {
    instruction: words.some((word) => INSTRUCTION_WORDS.has(word)),
    argument: ARGUMENT_WORDS.has(last),
    status: STATUS_WORDS.has(last),
    prompt: PROMPT_WORDS.has(last),
  }
}

/** A waiver counts only when it is a real sentence, not a placeholder. */
export function isWrittenWaiver(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const length = value.trim().length
  return length >= COMMAND_TABLE_WAIVER_MIN_CHARS && length <= COMMAND_TABLE_WAIVER_MAX_CHARS
}

export function checkCommandTables(manifest: unknown): CommandTableReport {
  const report: CommandTableReport = { blocking: [], warnings: [], waived: [] }
  for (const [table, schema] of declaredTables(manifest)) classifyTable(report, table, schema)
  return report
}

function classifyTable(report: CommandTableReport, table: string, schema: TableSchema): void {
  const shape = tableShape(Object.keys(schema.columns))
  const agentWritable = schema.agentWritable === true
  if (shape.instruction.length > 0 && shape.argument.length > 0 && shape.status.length > 0) {
    const finding = commandTableFinding(table, shape, agentWritable)
    if (!agentWritable && isWrittenWaiver(schema.commandTableWaiver)) {
      report.waived.push({ ...finding, waiver: schema.commandTableWaiver.trim() })
    } else {
      report.blocking.push(finding)
    }
    return
  }
  report.warnings.push(...fuzzyFindings(table, shape, agentWritable))
}

function tableShape(columns: string[]): TableShape {
  const shape: TableShape = { instruction: [], argument: [], status: [], prompt: [] }
  for (const column of columns) {
    const roles = columnRoles(column)
    if (roles.instruction) shape.instruction.push(column)
    if (roles.argument) shape.argument.push(column)
    if (roles.status) shape.status.push(column)
    if (roles.prompt) shape.prompt.push(column)
  }
  return shape
}

function commandTableFinding(table: string, shape: TableShape, agentWritable: boolean): CommandTableFinding {
  const columns = [...shape.instruction, ...shape.argument, ...shape.status]
  const reason = agentWritable
    ? ' It is also open to agent writes (agentWritable), so no waiver can cover it.'
    : ' Send commands through the panel command channel (createCommandChannel), or add ' +
      '"commandTableWaiver": "<why this table is safe>" to the table.'
  return {
    table,
    kind: 'command-table',
    columns,
    message:
      `Table "${table}" can hold a runnable command (${columns.join(' + ')}): ` +
      `an agent able to write or re-arm its rows could make your backend act.` +
      reason,
  }
}

function fuzzyFindings(table: string, shape: TableShape, agentWritable: boolean): CommandTableFinding[] {
  if (shape.status.length === 0) return []
  const findings: CommandTableFinding[] = []
  if (shape.prompt.length > 0) {
    const columns = [...shape.prompt, ...shape.status]
    findings.push({
      table,
      kind: 'prompt-with-status',
      columns,
      message: `Table "${table}" holds a prompt with a status (${columns.join(' + ')}). If your plugin runs these rows, an agent could re-arm one.`,
    })
  }
  const work = [...shape.instruction, ...shape.argument]
  if (work.length > 0 && nameWords(table).some((word) => QUEUE_WORDS.has(word))) {
    const columns = [...work, ...shape.status]
    findings.push({
      table,
      kind: 'queue-like-table',
      columns,
      message: `Table "${table}" looks like a work queue (${columns.join(' + ')}). Make sure your plugin never does work just because a row says so.`,
    })
  }
  if (agentWritable) {
    findings.push({
      table,
      kind: 'agent-writable-status',
      columns: [...shape.status],
      message: `Table "${table}" is open to agent writes and has a status (${shape.status.join(' + ')}). Never act on a row because its status changed.`,
    })
  }
  return findings
}

/** The manifest's declared tables, skipping anything malformed. Shared with the testing kit. */
export function declaredTables(manifest: unknown): Array<[string, TableSchema]> {
  const storage = isRecord(manifest) ? manifest.storage : undefined
  const collections = isRecord(storage) ? storage.collections : undefined
  if (!isRecord(collections)) return []
  return Object.entries(collections).filter(
    (entry): entry is [string, TableSchema] => isRecord(entry[1]) && isRecord(entry[1].columns)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
