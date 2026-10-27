import { describe, it, expect } from 'vitest'
import { validateManifest } from '../validators/manifest.js'
import type { PluginManifest } from '../types/manifest.js'

const baseManifest = {
  plugin: {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    author: 'Test Author',
    description: 'A test plugin',
    icon: 'zap',
    category: 'productivity',
    license: { type: 'free' },
  },
  settings: [],
  storage: { collections: {} },
  sdkVersion: '2.0.0',
} satisfies PluginManifest

const withPlugin = (extra: Record<string, unknown>) => ({
  ...baseManifest,
  plugin: { ...baseManifest.plugin, ...extra },
})

const errorsOf = (manifest: unknown): string => validateManifest(manifest).errors.join('\n')

describe('plugin.requiresOrganization (host: min 1, max 128, /^[A-Za-z0-9_-]+$/)', () => {
  it.each(['jlstradingco', 'Org_2-b', 'a'.repeat(128)])('accepts and keeps %s', (organization) => {
    const result = validateManifest(withPlugin({ requiresOrganization: organization }))
    expect(result.errors).toEqual([])
    expect(result.manifest?.plugin.requiresOrganization).toBe(organization)
  })

  it.each(['', 'a'.repeat(129), 'acme corp', 'acme.co', 'org/1', 42])('refuses %j', (organization) => {
    expect(errorsOf(withPlugin({ requiresOrganization: organization }))).toMatch(/^plugin\.requiresOrganization: /m)
  })

  it('is a published type field', () => {
    const plugin = { ...baseManifest.plugin, requiresOrganization: 'acme' } satisfies PluginManifest['plugin']
    expect(plugin.requiresOrganization).toBe('acme')
  })
})

describe('storage.collections.*.cliReadOnlyColumns (host: SQL identifiers, max 64, declared columns only)', () => {
  const columns = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`c${index}`, 'text']))
  const collectionWith = (cliReadOnlyColumns: unknown) => ({
    ...baseManifest,
    storage: { collections: { audit: { columns, cliReadOnlyColumns } } },
  })

  it('accepts and keeps declared columns, up to 64', () => {
    const atCap = Object.keys(columns).slice(0, 64)
    const result = validateManifest(collectionWith(atCap))
    expect(result.errors).toEqual([])
    expect(result.manifest?.storage.collections.audit?.cliReadOnlyColumns).toEqual(atCap)
  })

  it('refuses 65 entries', () => {
    expect(errorsOf(collectionWith(Object.keys(columns)))).toMatch(/^storage\.collections\.audit\.cliReadOnlyColumns: /m)
  })

  it('refuses a column the collection does not declare, with the host message', () => {
    expect(errorsOf(collectionWith(['c1', 'missing']))).toContain(
      'storage.collections.audit.cliReadOnlyColumns: cliReadOnlyColumns names "missing", which is not a declared column of this collection'
    )
  })

  it.each([[['bad name']], [['']], ['c1']])('refuses %j, which is not a list of SQL identifiers', (value) => {
    expect(validateManifest(collectionWith(value)).valid).toBe(false)
  })
})

describe('storage.kv (host: { agentWritable?: boolean })', () => {
  const kvWith = (kv: unknown) => ({ ...baseManifest, storage: { collections: {}, kv } })

  it.each([true, false])('accepts and keeps agentWritable: %s', (agentWritable) => {
    const result = validateManifest(kvWith({ agentWritable }))
    expect(result.errors).toEqual([])
    expect(result.manifest?.storage.kv?.agentWritable).toBe(agentWritable)
  })

  it('accepts an empty kv block', () => {
    expect(validateManifest(kvWith({})).errors).toEqual([])
  })

  it.each(['yes', 1, null])('refuses agentWritable: %j', (agentWritable) => {
    expect(errorsOf(kvWith({ agentWritable }))).toMatch(/^storage\.kv\.agentWritable: /m)
  })

  it('refuses a kv that is not an object', () => {
    expect(errorsOf(kvWith(true))).toMatch(/^storage\.kv: /m)
  })
})

describe('ui.sessions.realProjectContext (host: boolean)', () => {
  const sessionsWith = (realProjectContext: unknown) => ({ ...baseManifest, ui: { sessions: { realProjectContext } } })

  it.each([true, false])('accepts and keeps %s', (realProjectContext) => {
    const result = validateManifest(sessionsWith(realProjectContext))
    expect(result.errors).toEqual([])
    expect(result.manifest?.ui?.sessions?.realProjectContext).toBe(realProjectContext)
  })

  it.each(['true', 1, null])('refuses %j', (realProjectContext) => {
    expect(errorsOf(sessionsWith(realProjectContext))).toMatch(/^ui\.sessions\.realProjectContext: /m)
  })
})

describe('backend.timeouts (host: each key a positive integer of milliseconds)', () => {
  const keys = ['activateMs', 'onEnableMs', 'onDisableMs', 'onShutdownMs', 'onSettingsChangedMs', 'onAppReadyMs', 'cliDispatchMs'] as const
  const timeoutsWith = (timeouts: unknown) => ({
    ...baseManifest,
    backend: { entryPoint: 'dist/backend/index.js', timeouts },
  })

  it('accepts and keeps every host key', () => {
    const timeouts = Object.fromEntries(keys.map((key, index) => [key, 1000 * (index + 1)]))
    const result = validateManifest(timeoutsWith(timeouts))
    expect(result.errors).toEqual([])
    expect(result.manifest?.backend?.timeouts).toEqual(timeouts)
  })

  it('accepts a value outside the host clamp, which the host clamps rather than refuses', () => {
    expect(validateManifest(timeoutsWith({ activateMs: 1, cliDispatchMs: 600_000 })).errors).toEqual([])
  })

  it.each(keys.flatMap((key) => [0, -1, 1.5, '5000'].map((value) => [key, value] as const)))('refuses %s: %j', (key, value) => {
    expect(errorsOf(timeoutsWith({ [key]: value }))).toMatch(new RegExp(`^backend\\.timeouts\\.${key}: `, 'm'))
  })
})

describe('published types for the storage, sessions and backend fields', () => {
  it('declares cliReadOnlyColumns, kv, realProjectContext and timeouts', () => {
    const manifest = {
      ...baseManifest,
      storage: {
        collections: { audit: { columns: { action: 'text' }, cliReadOnlyColumns: ['action'] } },
        kv: { agentWritable: true },
      },
      ui: { sessions: { realProjectContext: true } },
      backend: { entryPoint: 'dist/backend/index.js', timeouts: { activateMs: 30_000, cliDispatchMs: 45_000 } },
    } satisfies PluginManifest
    expect(manifest.storage.kv.agentWritable).toBe(true)
  })

  it('makes a misspelt field a type error', () => {
    const backend = {
      entryPoint: 'dist/backend/index.js',
      // @ts-expect-error timeout is not a backend field; the host key is timeouts
      timeout: { activateMs: 30_000 },
    } satisfies PluginManifest['backend']
    expect(backend.entryPoint).toBe('dist/backend/index.js')
  })
})

describe('keybindings (host: max 20 of { shortcut 1-100, commandId 1-100 /^[a-zA-Z0-9-]+$/, label 1-200 })', () => {
  const binding = { shortcut: 'CommandOrControl+Shift+K', commandId: 'open-panel', label: 'Open my panel' }
  const keybindingsWith = (keybindings: unknown) => ({ ...baseManifest, keybindings })

  it('accepts and keeps 20 bindings at every length cap', () => {
    const atCap = Array.from({ length: 20 }, () => ({ shortcut: 'k'.repeat(100), commandId: 'c'.repeat(100), label: 'l'.repeat(200) }))
    const result = validateManifest(keybindingsWith(atCap))
    expect(result.errors).toEqual([])
    expect(result.manifest?.keybindings).toEqual(atCap)
  })

  it('refuses 21 bindings', () => {
    expect(errorsOf(keybindingsWith(Array.from({ length: 21 }, () => binding)))).toMatch(/^keybindings: /m)
  })

  it.each([
    ['shortcut', ''],
    ['shortcut', 'k'.repeat(101)],
    ['commandId', 'open panel'],
    ['commandId', 'open_panel'],
    ['commandId', 'c'.repeat(101)],
    ['label', ''],
    ['label', 'l'.repeat(201)],
  ])('refuses %s %j', (field, value) => {
    expect(errorsOf(keybindingsWith([{ ...binding, [field]: value }]))).toMatch(new RegExp(`^keybindings\\.0\\.${field}: `, 'm'))
  })

  it.each(['shortcut', 'commandId', 'label'])('refuses a binding with no %s', (field) => {
    const { [field as keyof typeof binding]: _dropped, ...partial } = binding
    expect(errorsOf(keybindingsWith([partial]))).toMatch(new RegExp(`^keybindings\\.0\\.${field}: `, 'm'))
  })
})

describe('process.allowedCommands (host: 1-20 bare command names, no interpreter)', () => {
  const processWith = (allowedCommands: unknown) => ({ ...baseManifest, process: { allowedCommands } })

  it('accepts and keeps 20 bare command names', () => {
    const atCap = ['ffmpeg', 'ffprobe', 'magick', 'pandoc', 'rg', 'jq', 'g++', 'clang-format', 'yt-dlp', 'exiftool', ...Array.from({ length: 10 }, (_, index) => `tool${index}`)]
    const result = validateManifest(processWith(atCap))
    expect(result.errors).toEqual([])
    expect(result.manifest?.process?.allowedCommands).toEqual(atCap)
  })

  it('refuses an empty list and 21 entries', () => {
    expect(errorsOf(processWith([]))).toMatch(/^process\.allowedCommands: /m)
    expect(errorsOf(processWith(Array.from({ length: 21 }, (_, index) => `tool${index}`)))).toMatch(/^process\.allowedCommands: /m)
  })

  it('refuses a process block with no allowedCommands', () => {
    expect(errorsOf({ ...baseManifest, process: {} })).toMatch(/^process\.allowedCommands: /m)
  })

  it.each(['/usr/bin/ffmpeg', 'C:\\tools\\ffmpeg.exe', 'ff*', 'ff mpeg', 'ffmpeg;rm', '$(id)', '', 'a'.repeat(101)])(
    'refuses %j, which is not a bare command name',
    (command) => {
      expect(errorsOf(processWith([command]))).toMatch(/^process\.allowedCommands\.0: /m)
    }
  )

  it('names the shape rule with the host message', () => {
    expect(errorsOf(processWith(['bin/ffmpeg']))).toContain(
      'process.allowedCommands.0: allowedCommands entries must be a bare command name (letters, digits, . _ + -) with no path separators, wildcards, whitespace, or shell characters'
    )
  })

  it.each([
    ['node', 'node'],
    ['NODE.EXE', 'node'],
    ['Python3', 'python3'],
    ['bash.cmd', 'bash'],
    ['pwsh', 'pwsh'],
    ['git', 'git'],
    ['busybox', 'busybox'],
  ])('refuses the interpreter %s with the host message', (command, normalized) => {
    expect(errorsOf(processWith(['ffmpeg', command]))).toContain(
      `process.allowedCommands.1: process.allowedCommands may not include the general-purpose interpreter "${normalized}" — it would let the plugin run arbitrary code`
    )
  })

  it.each(['nodemon', 'python-docs', 'gitleaks', 'node.js'])('accepts %s, which only looks like an interpreter', (command) => {
    expect(validateManifest(processWith([command])).errors).toEqual([])
  })
})

describe('boards.link needs boards.read (host superRefine)', () => {
  it('refuses boards.link alone, with the host message', () => {
    expect(validateManifest({ ...baseManifest, permissions: ['boards.link'] }).errors).toEqual([
      'permissions: "boards.link" requires an explicit "boards.read" permission in the same manifest: add boards.read to permissions',
    ])
  })

  it('accepts boards.link beside boards.read, and boards.read alone', () => {
    expect(validateManifest({ ...baseManifest, permissions: ['boards.read', 'boards.link'] }).errors).toEqual([])
    expect(validateManifest({ ...baseManifest, permissions: ['boards.read'] }).errors).toEqual([])
  })

  it('reports it even when workspace.read is present', () => {
    expect(validateManifest({ ...baseManifest, permissions: ['workspace.read', 'boards.link'] }).valid).toBe(false)
  })
})
