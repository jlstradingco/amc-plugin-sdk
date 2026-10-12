import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkCommandTables, columnRoles } from '../validators/command-tables.js'
import { validateManifest } from '../validators/manifest.js'
import { PRE_FIX_MANIFESTS, PRDSTACK_BUILD_TASKS } from './fixtures/command-table-manifests.js'

type Collections = Record<string, Record<string, unknown>>
type StorageManifest = { storage: { collections: Collections } }

const collectionsOf = (manifest: { storage: { collections: object } }): Collections =>
  JSON.parse(JSON.stringify(manifest.storage.collections)) as Collections

const withCollections = (collections: Collections): StorageManifest => ({ storage: { collections } })

/** Migrated onto the channel: the command table is simply gone (commands travel by ctx.rpc). */
function withoutCommandsTable(manifest: { storage: { collections: object } }): StorageManifest {
  const { commands: _removed, ...rest } = collectionsOf(manifest)
  void _removed
  return withCollections(rest)
}

/** Migrated the other way: the table survives as a job list that describes and never instructs. */
function withJobList(manifest: { storage: { collections: object } }): StorageManifest {
  const collections = collectionsOf(manifest)
  collections.commands = {
    columns: { label: 'text', status: 'text', error: 'text', startedAt: 'text', finishedAt: 'text' },
  }
  return withCollections(collections)
}

const WAIVER = 'Rows record finished commands for display; the backend never reads them back.'

const plugins = Object.entries(PRE_FIX_MANIFESTS)

describe('the four pre-fix command tables are blocked', () => {
  it.each(plugins)('%s: its commands table blocks, and nothing else does', (_name, manifest) => {
    const report = checkCommandTables(manifest)
    expect(report.blocking.map((f) => f.table)).toEqual(['commands'])
    const [finding] = report.blocking
    expect(finding?.kind).toBe('command-table')
    expect(finding?.columns).toContain('type')
    expect(finding?.columns).toContain('status')
    expect(finding?.columns.some((c) => c.startsWith('payload'))).toBe(true)
    expect(finding?.message).toContain('createCommandChannel')
  })
})

describe('the same plugins, migrated, pass cleanly', () => {
  it.each(plugins)('%s without its command table: no block, no warning', (_name, manifest) => {
    const report = checkCommandTables(withoutCommandsTable(manifest))
    expect(report.blocking).toEqual([])
    expect(report.warnings).toEqual([])
  })

  it.each(plugins)('%s with the table reduced to a job list: no block, no warning', (_name, manifest) => {
    const report = checkCommandTables(withJobList(manifest))
    expect(report.blocking).toEqual([])
    expect(report.warnings).toEqual([])
  })
})

describe('ordinary tables pass', () => {
  it.each(['todos', 'tasks', 'items'])('a plain to-do table named %s (title + status) passes with no warning', (table) => {
    const report = checkCommandTables(withCollections({ [table]: { columns: { title: 'text', status: 'text' } } }))
    expect(report).toEqual({ blocking: [], warnings: [], waived: [] })
  })

  it('an issue mirror with a body and a state is not a command table (no instruction column)', () => {
    const issues = { columns: { number: 'integer', title: 'text', state: 'text', body: 'text', labels: 'json' } }
    expect(checkCommandTables(withCollections({ issues }))).toEqual({ blocking: [], warnings: [], waived: [] })
  })

  it('every example plugin shipped with the SDK passes with no warning', () => {
    const examplesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../examples')
    const manifests = fs
      .readdirSync(examplesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(examplesDir, entry.name, 'manifest.json'))
      .filter((file) => fs.existsSync(file))
    expect(manifests.length).toBeGreaterThanOrEqual(7)
    for (const file of manifests) {
      const report = checkCommandTables(JSON.parse(fs.readFileSync(file, 'utf-8')))
      expect({ file, ...report }).toEqual({ file, blocking: [], warnings: [], waived: [] })
    }
  })
})

describe('fuzzy shapes warn and never block', () => {
  it("PRDStack's build_tasks (a prompt with a status) warns, as the plan says it must", () => {
    const report = checkCommandTables(PRDSTACK_BUILD_TASKS)
    expect(report.blocking).toEqual([])
    expect(report.warnings).toHaveLength(1)
    expect(report.warnings[0]).toMatchObject({ table: 'build_tasks', kind: 'prompt-with-status', columns: ['prompt', 'status'] })
  })

  it('a queue-like table that picks an action warns', () => {
    const report = checkCommandTables(withCollections({ jobs: { columns: { action: 'text', status: 'text' } } }))
    expect(report.warnings.map((f) => f.kind)).toEqual(['queue-like-table'])
  })

  it('a job list (label, status, error) does not warn even under a queue-like name', () => {
    const report = checkCommandTables(withCollections({ jobs: { columns: { label: 'text', status: 'text', error: 'text' } } }))
    expect(report.warnings).toEqual([])
  })

  it('a table open to agent writes that has a status warns', () => {
    const notes = { columns: { title: 'text', status: 'text' }, agentWritable: true }
    expect(checkCommandTables(withCollections({ notes })).warnings.map((f) => f.kind)).toEqual(['agent-writable-status'])
  })
})

describe('the written waiver', () => {
  const commandsTable = collectionsOf(PRE_FIX_MANIFESTS.forms).commands!

  it('lets a command-shaped table through, and lists it with its reason for reviewers', () => {
    const report = checkCommandTables(withCollections({ commands: { ...commandsTable, commandTableWaiver: WAIVER } }))
    expect(report.blocking).toEqual([])
    expect(report.waived).toHaveLength(1)
    expect(report.waived[0]).toMatchObject({ table: 'commands', waiver: WAIVER })
  })

  it('does not count when it is a placeholder', () => {
    const report = checkCommandTables(withCollections({ commands: { ...commandsTable, commandTableWaiver: 'n/a' } }))
    expect(report.blocking.map((f) => f.table)).toEqual(['commands'])
  })

  it('never covers a table that is open to agent writes', () => {
    const table = { ...commandsTable, commandTableWaiver: WAIVER, agentWritable: true }
    const report = checkCommandTables(withCollections({ commands: table }))
    expect(report.waived).toEqual([])
    expect(report.blocking[0]?.message).toContain('no waiver can cover it')
  })

  it('is validated by the manifest schema with the same bounds the check uses', () => {
    const base = {
      plugin: { id: 'p', name: 'P', version: '1.0.0', author: 'A', description: 'D', icon: 'zap', category: 'other', license: { type: 'free' } },
    }
    const withWaiver = (waiver: unknown) => ({ ...base, storage: { collections: { commands: { ...commandsTable, commandTableWaiver: waiver } } } })
    expect(validateManifest(withWaiver(WAIVER)).valid).toBe(true)
    expect(validateManifest(withWaiver('   too short    ')).valid).toBe(false)
    expect(validateManifest(withWaiver('x'.repeat(501))).valid).toBe(false)
    expect(validateManifest(withWaiver(42)).valid).toBe(false)
  })
})

describe('column names are read by their words', () => {
  it.each([
    ['payloadJson', 'argument'],
    ['payload_json', 'argument'],
    ['args-text', 'argument'],
    ['prompt', 'argument'],
    ['type', 'instruction'],
    ['pendingAction', 'instruction'],
    ['content_type', 'instruction'],
    ['summary_status', 'status'],
    ['checksState', 'status'],
  ] as const)('%s reads as %s', (column, role) => {
    expect(columnRoles(column)[role]).toBe(true)
  })

  it.each(['input_tokens', 'metadata', 'status_code', 'body_format', 'typed_at'])(
    '%s is not an argument or a status column',
    (column) => {
      const roles = columnRoles(column)
      expect(roles.argument || roles.status).toBe(false)
    }
  )
})

describe('the check never throws on a malformed manifest', () => {
  it.each([undefined, null, 42, 'x', {}, { storage: 'x' }, { storage: { collections: { t: 'x' } } }, { storage: { collections: { t: { columns: [] } } } }])(
    'reports nothing for %j',
    (manifest) => {
      expect(checkCommandTables(manifest)).toEqual({ blocking: [], warnings: [], waived: [] })
    }
  )
})
