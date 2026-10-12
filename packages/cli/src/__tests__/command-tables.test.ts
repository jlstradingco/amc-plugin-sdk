import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  commandTablesPreflight,
  findPendingPolls,
  reportCommandTables,
  scanPendingPolls,
} from '../lib/command-tables.js'
import { checkDeclaredPermissions } from '../lib/publish-preflight.js'

// The rule itself is tested in the SDK against the four plugins' real pre-fix tables. These
// tests cover how the CLI reports it: preflight's verdict, validate's lines, and the code hint.

const withTables = (collections: Record<string, unknown>) => ({ storage: { collections } })

/** Forms 0.12.0's command table, the shape all four plugins shipped. */
const COMMANDS = { columns: { type: 'text', payload: 'json', status: 'text', result: 'json' } }
const JOB_LIST = { columns: { label: 'text', status: 'text', error: 'text' } }
const WAIVER = 'Rows record finished commands for display; the backend never reads them back.'

function captureOutput() {
  const lines: string[] = []
  const record = (...args: unknown[]) => {
    lines.push(args.join(' '))
  }
  for (const method of ['log', 'warn', 'error'] as const) vi.spyOn(console, method).mockImplementation(record)
  return lines
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('commandTablesPreflight', () => {
  it('fails a manifest with a command table, naming the table and the way out', () => {
    const result = commandTablesPreflight(withTables({ commands: COMMANDS, jobs: JOB_LIST }))
    expect(result.status).toBe('fail')
    expect(result.message).toContain('"commands" (type + payload + status)')
    expect(result.suggestion).toContain('createCommandChannel')
    expect(result.suggestion).toContain('commandTableWaiver')
  })

  it('passes once the table only describes jobs', () => {
    expect(commandTablesPreflight(withTables({ commands: JOB_LIST })).status).toBe('pass')
  })

  it('passes a waived table, and says it was waived', () => {
    const result = commandTablesPreflight(withTables({ commands: { ...COMMANDS, commandTableWaiver: WAIVER } }))
    expect(result).toMatchObject({ status: 'pass', message: expect.stringContaining('waived: commands') })
  })

  it('warns, never fails, on a prompt with a status', () => {
    const result = commandTablesPreflight(withTables({ build_tasks: { columns: { prompt: 'text', status: 'text' } } }))
    expect(result.status).toBe('warn')
  })
})

describe('reportCommandTables (validate)', () => {
  it('prints the block and returns true so validate fails', () => {
    const lines = captureOutput()
    expect(reportCommandTables(withTables({ commands: COMMANDS }), [], process.cwd())).toBe(true)
    expect(lines.join('\n')).toContain('Table "commands" can hold a runnable command')
  })

  it('prints a waiver as information and does not fail', () => {
    const lines = captureOutput()
    const failed = reportCommandTables(withTables({ commands: { ...COMMANDS, commandTableWaiver: WAIVER } }), [], process.cwd())
    expect(failed).toBe(false)
    expect(lines.join('\n')).toContain(WAIVER)
  })

  it('reports a clean manifest as a pass', () => {
    const lines = captureOutput()
    expect(reportCommandTables(withTables({ jobs: JOB_LIST }), [], process.cwd())).toBe(false)
    expect(lines.join('\n')).toContain('Command tables')
  })
})

describe('the pending-rows code hint', () => {
  it('finds queries that ask for pending or queued rows, with their line numbers', () => {
    const code = [
      'const a = 1',
      "const rows = await ctx.db.query('commands', {",
      "  where: { status: 'pending' },",
      '})',
      "const more = await store.queryAll({ type, status: 'queued' })",
    ].join('\n')
    expect(findPendingPolls(code)).toEqual([2, 5])
  })

  it('ignores status values that are not waiting work, and objects outside a query', () => {
    const code = [
      "await ctx.db.query('commands', { where: { status: 'done' } })",
      "return { status: 'pending' }",
      "await ctx.db.update('commands', id, { status: 'pending' })",
    ].join('\n')
    expect(findPendingPolls(code)).toEqual([])
  })

  it('scans folders and single files, and warns in validate without failing it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amc-pending-'))
    try {
      fs.mkdirSync(path.join(dir, 'backend'))
      fs.writeFileSync(path.join(dir, 'backend', 'drain.js'), "ctx.db.query('commands', { where: { status: 'pending' } })\n")
      fs.writeFileSync(path.join(dir, 'server.mjs'), "ctx.db.query('jobs', { where: { state: 'queued' } })\n")
      fs.writeFileSync(path.join(dir, 'notes.txt'), "ctx.db.query('x', { where: { status: 'pending' } })\n")
      const hits = scanPendingPolls([path.join(dir, 'backend'), path.join(dir, 'server.mjs'), path.join(dir, 'missing')])
      expect(hits.map((hit) => path.relative(dir, hit))).toEqual([path.join('backend', 'drain.js:1'), 'server.mjs:1'])

      const lines = captureOutput()
      expect(reportCommandTables(withTables({ jobs: JOB_LIST }), [path.join(dir, 'backend')], dir)).toBe(false)
      expect(lines.join('\n')).toContain(`${path.join('backend', 'drain.js')}:1 asks a table for its pending rows`)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('boards.read', () => {
  it('is a permission preflight accepts', () => {
    expect(checkDeclaredPermissions(['storage', 'boards.read'])).toMatchObject({ status: 'pass' })
  })
})
