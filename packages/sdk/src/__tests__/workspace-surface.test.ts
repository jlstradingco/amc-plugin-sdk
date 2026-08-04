import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateManifest, manifestSchema } from '../index.js'
import { createTestContext } from '../testing/index.js'
import type { WorkspaceScope, WorkspaceHandle, WorktreeRef } from '../index.js'
import {
  TOOL_CALL_MARKER,
  TOOL_RESULT_MARKER,
  TOOL_CALL_RE,
  TOOL_RESULT_RE,
  stripToolLines,
} from '../types/markers.js'

const here = path.dirname(fileURLToPath(import.meta.url))

/** The `ui` entry point this schema demands on every `ui` block (see S6). */
const UI_ENTRY = 'i.html'

/** The minimum valid manifest every case below builds on. */
function baseManifest(): Record<string, unknown> {
  return {
    plugin: {
      id: 'workspace-plugin',
      name: 'Workspace',
      version: '1.0.0',
      author: 'test',
      description: 'test',
      icon: 'x',
      category: 'other',
      license: { type: 'free' },
    },
    settings: [],
    storage: { collections: {} },
    migrations: [],
    sdkVersion: '1.0.0',
  }
}

describe('workspace permissions', () => {
  it('accepts all three workspace permissions in a manifest', () => {
    const result = validateManifest({
      ...baseManifest(),
      permissions: ['workspace.read', 'workspace.write', 'workspace.exec'],
    })
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('still rejects a workspace-shaped permission the host has never defined', () => {
    // Guards against a future "well, workspace.* is a namespace, let it through"
    // loosening: the enum is closed, not a prefix match.
    const result = validateManifest({
      ...baseManifest(),
      permissions: ['workspace.admin'],
    })
    expect(result.valid).toBe(false)
  })
})

describe('workspace manifest block', () => {
  it('accepts the spec\'s example manifest, plus the ui fields this schema demands', () => {
    // Command slots transcribed from the Test Tracker plugin spec
    // (test-tracker-plugin repo, docs/spec/01-capabilities.md), section
    // "Manifest". The spec's own `ui` block is just `{ hideProjectPanel: true }`;
    // `entryPoint` and `sidebar` are added here only because THIS schema requires
    // them and the host does not — see the note in validators/manifest.ts. If this
    // ever fails, the SDK schema and the specification have diverged — fix the
    // schema, or amend the spec deliberately.
    const result = validateManifest({
      ...baseManifest(),
      permissions: ['workspace.read', 'workspace.write', 'workspace.exec', 'inbox', 'cli'],
      ui: { entryPoint: 'index.html', sidebar: { title: 'T', icon: 'i' }, hideProjectPanel: true },
      workspace: {
        binding: { granularity: 'package' },
        commandSlots: [
          { name: 'vitest.run', args: ['--config', '{reporterConfig}', '{files}'] },
          {
            name: 'vitest.runNamed',
            args: ['--config', '{reporterConfig}', '-t', '{name}', '{files}'],
          },
          {
            name: 'jest.run',
            args: [
              '--reporters=default',
              '--reporters={reporter}',
              '--testLocationInResults',
              '--forceExit',
              '{files}',
            ],
          },
          {
            name: 'jest.runNamed',
            args: [
              '--reporters=default',
              '--reporters={reporter}',
              '--testLocationInResults',
              '--forceExit',
              '-t',
              '{name}',
              '{files}',
            ],
          },
          { name: 'generic.run', args: [] },
        ],
      },
    })
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('keeps an EMPTY args array — the spec\'s generic.run slot declares one', () => {
    // A `.min(1)` on args would reject the spec's own manifest. Pinned so nobody
    // "tightens" it back.
    const parsed = manifestSchema.safeParse({
      ...baseManifest(),
      workspace: { commandSlots: [{ name: 'generic.run', args: [] }] },
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a slot with no name, and a non-string arg', () => {
    expect(
      manifestSchema.safeParse({
        ...baseManifest(),
        workspace: { commandSlots: [{ name: '', args: [] }] },
      }).success
    ).toBe(false)
    expect(
      manifestSchema.safeParse({
        ...baseManifest(),
        workspace: { commandSlots: [{ name: 'x', args: [42] }] },
      }).success
    ).toBe(false)
  })

  it('rejects a binding granularity the spec does not define', () => {
    expect(
      manifestSchema.safeParse({
        ...baseManifest(),
        workspace: { binding: { granularity: 'directory' } },
      }).success
    ).toBe(false)
  })

  it('survives a parse round-trip instead of being silently stripped', () => {
    // The whole point of declaring the block: a non-strict Zod object drops
    // unknown keys, so an undeclared field validates and then vanishes.
    const result = validateManifest({
      ...baseManifest(),
      workspace: {
        binding: { granularity: 'package' },
        commandSlots: [{ name: 'vitest.run', args: ['--config'] }],
      },
    })
    expect(result.manifest?.workspace?.binding?.granularity).toBe('package')
    expect(result.manifest?.workspace?.commandSlots?.[0]?.name).toBe('vitest.run')
  })
})

describe('B2 drift: fields that were host-real but SDK-invisible', () => {
  it('keeps ui.hideProjectPanel through the parse', () => {
    const result = validateManifest({
      ...baseManifest(),
      ui: { entryPoint: UI_ENTRY, sidebar: { title: 'T', icon: 'i' }, hideProjectPanel: true },
    })
    expect(result.manifest?.ui?.hideProjectPanel).toBe(true)
  })

  it('keeps ui.sessions.contextTemplate through the parse', () => {
    const result = validateManifest({
      ...baseManifest(),
      ui: {
        entryPoint: UI_ENTRY,
        sidebar: { title: 'T', icon: 'i' },
        sessions: { contextTemplate: 'You are working on {{projectName}}.' },
      },
    })
    expect(result.manifest?.ui?.sessions?.contextTemplate).toBe(
      'You are working on {{projectName}}.'
    )
  })

  it('caps suggestedPrompts at the host\'s limit of 4', () => {
    const prompts = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ label: `l${i}`, prompt: `p${i}` }))
    const build = (n: number) => ({
      ...baseManifest(),
      ui: {
        entryPoint: UI_ENTRY,
        sidebar: { title: 'T', icon: 'i' },
        sessions: { suggestedPrompts: prompts(n) },
      },
    })
    expect(manifestSchema.safeParse(build(4)).success).toBe(true)
    expect(manifestSchema.safeParse(build(5)).success).toBe(false)
  })

  it('keeps storage.collections[].uniqueIndexes through the parse', () => {
    const result = validateManifest({
      ...baseManifest(),
      storage: {
        collections: {
          results: { columns: { worktree: 'text', file: 'text' }, uniqueIndexes: [['worktree', 'file']] },
        },
      },
    })
    expect(result.manifest?.storage.collections.results?.uniqueIndexes).toEqual([
      ['worktree', 'file'],
    ])
  })

  it('rejects an empty uniqueIndexes tuple', () => {
    expect(
      manifestSchema.safeParse({
        ...baseManifest(),
        storage: { collections: { a: { columns: { x: 'text' }, uniqueIndexes: [[]] } } },
      }).success
    ).toBe(false)
  })
})

describe('B2 drift: the migrations op enum', () => {
  // This enum had ZERO test coverage before — nothing in the repo builds a
  // non-empty migrations array, so a wrong op list shipped green. These cases
  // exist so the next edit cannot.
  const withOp = (op: Record<string, unknown>) => ({
    ...baseManifest(),
    migrations: [{ version: '1.0.1', operations: [op] }],
  })

  it.each(['add_column', 'add_index', 'drop_index'])('accepts the host op %s', (type) => {
    const parsed = manifestSchema.safeParse(withOp({ type, collection: 'runs', column: 'c' }))
    expect(parsed.success).toBe(true)
  })

  it.each(['remove_column', 'remove_index'])(
    'rejects %s — an SDK-only fiction the host never accepted',
    (type) => {
      const parsed = manifestSchema.safeParse(withOp({ type, collection: 'runs', column: 'c' }))
      expect(parsed.success).toBe(false)
    }
  )

  it('requires `column`, which the host declares non-optional', () => {
    expect(manifestSchema.safeParse(withOp({ type: 'add_column', collection: 'runs' })).success).toBe(
      false
    )
  })

  it('accepts a scalar `default`', () => {
    expect(
      manifestSchema.safeParse(
        withOp({ type: 'add_column', collection: 'runs', column: 'c', default: 0 })
      ).success
    ).toBe(true)
  })
})

describe('tool content markers', () => {
  it('matches the host codepoints exactly', () => {
    // The glyphs have near-identical lookalikes, so assert codepoints, not chars.
    expect(TOOL_CALL_MARKER.codePointAt(0)).toBe(0x25b8)
    expect(TOOL_RESULT_MARKER.codePointAt(0)).toBe(0x2190)
  })

  it('requires the marker at line start AND a following space', () => {
    expect(TOOL_CALL_RE.test('▸ Read(file.ts)')).toBe(true)
    expect(TOOL_RESULT_RE.test('← 42 lines')).toBe(true)
    // Bare marker with nothing after it is not a tool line.
    expect(TOOL_CALL_RE.test('▸')).toBe(false)
    // Mid-line is not a tool line.
    expect(TOOL_CALL_RE.test('see ▸ here')).toBe(false)
  })

  it('strips tool lines but leaves prose', () => {
    const input = ['Here is what I did.', '▸ Read(a.ts)', '← 10 lines', 'All done.'].join('\n')
    expect(stripToolLines(input)).toBe(['Here is what I did.', 'All done.'].join('\n'))
  })

  it('does NOT strip a marker inside a fenced code block', () => {
    // The load-bearing case: the host's own consumers are fence-aware, and a
    // fence-blind stripper corrupts any transcript that quotes marker syntax.
    const input = ['Example:', '```', '▸ Read(a.ts)', '```', 'Done.'].join('\n')
    expect(stripToolLines(input)).toBe(input)
  })

  it('resumes stripping after the fence closes', () => {
    const input = ['```', '▸ kept', '```', '▸ dropped', 'prose'].join('\n')
    expect(stripToolLines(input)).toBe(['```', '▸ kept', '```', 'prose'].join('\n'))
  })

  it('handles an empty string', () => {
    expect(stripToolLines('')).toBe('')
  })
})

describe('the mock refuses to fake ctx.workspace', () => {
  // The whole point. `ctx.events` was mocked as a live EventEmitter, so plugin
  // tests passed for months while the production path was dead in BOTH
  // directions — and the host's own contract doc asserted the opposite. A mock
  // that fakes an unimplemented capability manufactures exactly that false
  // confidence, so this one rejects instead.
  const ws = () => createTestContext().ctx.workspace

  it('exposes workspace as an own enumerable key (the parity guard reads Object.keys)', () => {
    expect(Object.keys(createTestContext().ctx)).toContain('workspace')
  })

  it.each([
    'listProjects',
    'listWorktrees',
    'requestAccess',
    'resolve',
    'glob',
    'stat',
    'exists',
    'readFile',
    'readFiles',
    'listBindings',
    'writeFile',
    'deleteFile',
    'requestBinding',
    'exec',
    'execStatus',
    'execResults',
    'execCancel',
  ] as const)('rejects %s', async (method) => {
    const fn = ws()[method] as (...args: unknown[]) => Promise<unknown>
    await expect(fn()).rejects.toThrow(/not implemented by the AMC host/i)
  })

  it('names the real runtime failure so the message is actionable', async () => {
    await expect(ws().listProjects()).rejects.toThrow(/Unknown namespace/)
  })
})

describe('an author can actually write against the typed surface', () => {
  // The it.each above calls methods through an index signature, which proves
  // they reject but proves NOTHING about their signatures. This block calls them
  // the way a plugin author would — if a parameter type is wrong, this
  // file stops compiling, which is the point.
  it('typechecks a realistic read/write/exec flow', async () => {
    const ctx = createTestContext().ctx
    const scope: WorkspaceScope = { projectId: 'p1', worktree: null }
    const handle: WorkspaceHandle = { ...scope, path: 'src/a.test.ts' }

    const calls: Array<Promise<unknown>> = [
      ctx.workspace.glob(scope, ['**/*.test.ts'], { includeIgnored: false }),
      ctx.workspace.stat(handle),
      ctx.workspace.readFile(handle),
      ctx.workspace.readFiles([handle]),
      ctx.workspace.writeFile(handle, 'contents', { expectedMtimeMs: null }),
      ctx.workspace.deleteFile(handle, { expectedMtimeMs: 1 }),
      ctx.workspace.listBindings(scope),
      ctx.workspace.requestBinding(scope, 'packages/core'),
      // The list-valued var is the load-bearing shape: it expands to N argv
      // entries host-side.
      ctx.workspace.exec(scope, 'vitest.run', { files: ['a.test.ts', 'b.test.ts'], name: 'x' }),
      ctx.workspace.execStatus('job-1', { since: 0 }),
      ctx.workspace.execResults('job-1', { since: 0 }),
      ctx.workspace.execCancel('job-1'),
      ctx.workspace.resolve('/abs/path'),
      ctx.workspace.listWorktrees('p1'),
    ]

    // Every one of them rejects, because the host has no workspace namespace.
    const settled = await Promise.allSettled(calls)
    expect(settled.every((s) => s.status === 'rejected')).toBe(true)
  })

  it('models a worktree ref as string-or-null, main being null', () => {
    const main: WorktreeRef = null
    const other: WorktreeRef = '/abs/repo/.worktrees/feat-x'
    expect(main).toBeNull()
    expect(typeof other).toBe('string')
  })
})

describe('the binding surface has no setter', () => {
  it('declares no method that writes a command binding', () => {
    // The capability's core security property: the plugin never supplies a
    // command string, at exec time or as a proposal. Today that rests on
    // absence-of-code, which no other test would notice — a well-meaning
    // "add setBinding for symmetry" PR would pass everything else.
    const source = fs.readFileSync(path.join(here, '..', 'types', 'context.ts'), 'utf-8')
    const api = source.slice(source.indexOf('interface WorkspaceApi'))
    const body = api.slice(0, api.indexOf('\n}'))

    for (const forbidden of ['setBinding', 'createBinding', 'updateBinding', 'writeBinding']) {
      expect(body).not.toContain(forbidden)
    }
    // The two sanctioned binding methods are present, so the check above is
    // testing a real surface rather than passing on an empty string.
    expect(body).toContain('requestBinding')
    expect(body).toContain('listBindings')
  })
})
