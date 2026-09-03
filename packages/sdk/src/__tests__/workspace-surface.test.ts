import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
// Everything is imported through the PACKAGE BARREL, never through
// '../types/markers.js' directly. package.json exposes only '.', './browser',
// './validators' and './testing', so the deep path is unreachable to a plugin
// author — testing through it would let someone delete the barrel's re-export
// block and break every consumer while this suite stayed green.
import {
  validateManifest,
  manifestSchema,
  TOOL_CALL_MARKER,
  TOOL_RESULT_MARKER,
  TOOL_CALL_RE,
  TOOL_RESULT_RE,
  stripToolLines,
} from '../index.js'
import { createTestContext } from '../testing/index.js'
import type { WorkspaceScope, WorkspaceHandle, WorktreeRef } from '../index.js'

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

  it('keeps ui.hideSessionsPane through the parse', () => {
    // The SIBLING opt-out, and the reason "full width" needs both. Pane 2 has
    // two owners host-side; hiding one alone just hands the column to the
    // other, so a manifest round-tripped through the SDK that kept
    // hideProjectPanel and dropped this one silently un-full-widths the plugin.
    const result = validateManifest({
      ...baseManifest(),
      ui: {
        entryPoint: UI_ENTRY,
        sidebar: { title: 'T', icon: 'i' },
        hideProjectPanel: true,
        hideSessionsPane: true,
      },
    })
    expect(result.manifest?.ui?.hideProjectPanel).toBe(true)
    expect(result.manifest?.ui?.hideSessionsPane).toBe(true)
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
  // `ctx.events` was mocked as a live EventEmitter, so plugin tests passed for
  // months while the production path was dead in BOTH directions. A mock that
  // fakes a capability it cannot faithfully model manufactures exactly that
  // false confidence, so this one rejects instead.
  //
  // The REASON changed on 2026-08-11: the host does implement workspace now, so
  // the refusal is no longer "there is no such namespace" but "the grant model,
  // native confirms and single-flight limits are not reproducible in-memory".
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
    'writeFile',
    'writeFiles',
    'mkdir',
    'deleteFile',
    'run',
    'exec',
    'execStatus',
    'execResults',
    'execCancel',
  ] as const)('rejects %s', async (method) => {
    const fn = ws()[method] as (...args: unknown[]) => Promise<unknown>
    await expect(fn()).rejects.toThrow(/does not\s+fake it/i)
  })

  it('does NOT claim the host is missing the namespace, because it is not', async () => {
    // Regression guard for the six days this mock told authors `ctx.workspace`
    // was unimplemented after the host had shipped it. A refusal message is
    // documentation; a wrong one sends people to build a workaround they do not
    // need.
    await expect(ws().listProjects()).rejects.toThrow(/implemented by the AMC host/i)
    await expect(ws().listProjects()).rejects.not.toThrow(/Unknown namespace/)
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
      ctx.workspace.exists(handle),
      ctx.workspace.readFile(handle),
      ctx.workspace.readFiles([handle]),
      // THREE args: the compare-and-swap token is REQUIRED, and `null` is not a
      // "skip the check" escape hatch — it asserts the file must not exist.
      // (GitHub #28 landed this after the audit that recorded its absence.)
      ctx.workspace.writeFile(handle, 'contents', 1_700_000_000_000.5),
      ctx.workspace.writeFile(handle, 'fresh file', null),
      ctx.workspace.writeFiles([{ handle, content: 'contents', expectedMtimeMs: null }]),
      ctx.workspace.mkdir(handle),
      // deleteFile's token is NOT nullable — you cannot delete a file you have
      // never read, so "must not exist" is meaningless here and the host's zod
      // omits `.nullable()` on this one alone.
      ctx.workspace.deleteFile(handle, 1_700_000_000_000),
      // The plugin supplies command + argv DIRECTLY — there is no manifest
      // command-slot indirection, so this is the shape that must compile.
      ctx.workspace.run({ scope, command: 'git', args: ['status', '--porcelain'] }),
      ctx.workspace.run({ scope, command: 'npm', args: ['test'], timeoutMs: 60_000 }),
      // The JOB path. Note the start request has NO timeoutMs field: a job dies
      // from silence, never from age, so the host's schema has nowhere to put
      // one and strips it. Making it a type error here is the whole point —
      // accepting it would let an author believe a wall clock took effect.
      ctx.workspace.exec({ scope, command: 'npm', args: ['test'] }),
      ctx.workspace.execStatus('job-1'),
      ctx.workspace.execResults('job-1'),
      ctx.workspace.execResults('job-1', { resultsCursor: 0, consoleCursor: 0, maxBytes: 65_536 }),
      ctx.workspace.execCancel('job-1'),
      ctx.workspace.resolve('/abs/path'),
      ctx.workspace.listWorktrees('p1'),
      ctx.workspace.listProjects(),
      ctx.workspace.requestAccess(),
    ]

    // Every one rejects — the harness declines to fake the capability.
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

describe('the typed surface matches the host method set exactly', () => {
  it('declares the host\'s 18 methods and none of the spec-only ones', () => {
    // This block used to assert a security property that no longer exists: that
    // the plugin never supplies a command string, enforced by a binding model
    // (`listBindings` / `requestBinding`) with no setter. The host implemented
    // `ctx.workspace` differently — `run` takes `command` and `args` from the
    // plugin directly — so injection is closed by `shell: false`, a filtered
    // PATH and a native confirm instead. Asserting the old property here would
    // pin a design the host rejected.
    //
    // What is worth pinning is the METHOD SET, because that is what went wrong:
    // the SDK carried six methods transcribed from an unimplemented spec while
    // missing three the host shipped.
    const source = fs.readFileSync(path.join(here, '..', 'types', 'context.ts'), 'utf-8').replace(/\r\n/g, '\n')
    const api = source.slice(source.indexOf('interface WorkspaceApi'))
    const body = api.slice(0, api.indexOf('\n}'))

    // Method declarations sit at exactly two spaces of indent; JSDoc lines and
    // wrapped parameters do not, so this picks up signatures only.
    const methods = [...body.matchAll(/^ {2}([a-zA-Z][A-Za-z0-9_]*)\s*\(/gm)].map((m) => m[1])

    // Vacuity guard first: if the slice or the regex ever stops matching, an
    // empty list would satisfy everything below. It has earned its keep — it
    // fired for real during the build, when the interface had not landed yet.
    expect(methods.length).toBeGreaterThan(0)

    // Generated from the host's WORKSPACE_SCHEMAS at origin/master@e4f85b5edc.
    // Re-derive from the host when it moves; never edit this to match the SDK.
    //
    // Was 14 at origin/master@8722cc3fca. The four exec-JOB methods below are
    // NOT a revival of the spec fiction this block used to tombstone — the host
    // shipped them for real in Agent-Orchestrator PR #2401 (GitHub #29), six
    // days after that audit pinned their absence. Same names, different
    // provenance: the fiction was a binding-model transcription, these are read
    // off WORKSPACE_SCHEMAS. See the ExecJob types in context.ts.
    expect([...methods].sort()).toEqual(
      [
        'deleteFile',
        'exec',
        'execCancel',
        'execResults',
        'execStatus',
        'exists',
        'glob',
        'listProjects',
        'listWorktrees',
        'mkdir',
        'readFile',
        'readFiles',
        'requestAccess',
        'resolve',
        'run',
        'stat',
        'writeFile',
        'writeFiles',
      ].sort()
    )

    // Explicit tombstones — the binding model, which the host DELETED rather
    // than deferred. `workspace-safe-errors.ts` on origin/master carries the
    // note: "no binding id, no template, no vars, no `listBindings` — so those
    // six strings were unreachable prose promising a capability the user never
    // got." Naming them here means a copy-paste revival from the spec (which
    // still describes them) fails loudly rather than passing the count.
    for (const gone of ['listBindings', 'requestBinding']) {
      expect(methods).not.toContain(gone)
    }
  })

  it('declares every ExecJobState the host can report', () => {
    // Pinned by source-parse for the same reason as the method set above: a
    // union is invisible at runtime, so nothing else in this suite can notice
    // a missing member. This one was ALREADY wrong once — the first mirror of
    // this type dropped `'failed'`, which a plugin can genuinely observe (the
    // job methods are not single-flight, so a second `exec` hands you the first
    // call's jobId, and declining that call's confirm lands the job there).
    // An exhaustive switch over a six-member union would have been unsound.
    const source = fs.readFileSync(path.join(here, '..', 'types', 'context.ts'), 'utf-8').replace(/\r\n/g, '\n')
    const decl = source.slice(source.indexOf('export type WorkspaceExecJobState'))
    const body = decl.slice(0, decl.indexOf('\n\n'))
    const states = [...body.matchAll(/'([a-z-]+)'/g)].map((m) => m[1])

    expect(states.length).toBeGreaterThan(0) // vacuity guard
    // From the host's ExecJobState at origin/master@e4f85b5edc
    // (exec/exec-job-registry.ts). Re-derive from the host when it moves.
    expect([...states].sort()).toEqual(
      ['cancelled', 'exited', 'failed', 'idle-timeout', 'running', 'starting', 'stopping'].sort()
    )
  })
})
