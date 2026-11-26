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

describe('plugin.sidebarGroup (host: one of the nine sidebar group ids, optional)', () => {
  const GROUP_IDS = [
    'creative',
    'developer-tools-group',
    'ai-tools',
    'automation-group',
    'agent-tools',
    'productivity',
    'communication',
    'prompt-tools',
    'insights-group',
  ] as const

  it.each(GROUP_IDS)('accepts and keeps %s', (group) => {
    const result = validateManifest(withPlugin({ sidebarGroup: group }))
    expect(result.errors).toEqual([])
    expect(result.manifest?.plugin.sidebarGroup).toBe(group)
  })

  it('still validates when the key is absent', () => {
    const result = validateManifest(baseManifest)
    expect(result.errors).toEqual([])
    expect(result.manifest?.plugin.sidebarGroup).toBeUndefined()
  })

  it.each(['', 'Creative', 'games', 'channels', 42])('refuses %j', (group) => {
    expect(errorsOf(withPlugin({ sidebarGroup: group }))).toMatch(/^plugin\.sidebarGroup: /m)
  })

  it('is a published type field', () => {
    const plugin = { ...baseManifest.plugin, sidebarGroup: 'creative' } satisfies PluginManifest['plugin']
    expect(plugin.sidebarGroup).toBe('creative')
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

describe('ui.presentation (host: z.enum popup | full, optional)', () => {
  const uiWith = (presentation: unknown) => ({ ...baseManifest, ui: { presentation } })

  it.each(['popup', 'full'])('accepts and keeps %s', (presentation) => {
    const result = validateManifest(uiWith(presentation))
    expect(result.errors).toEqual([])
    expect(result.manifest?.ui?.presentation).toBe(presentation)
  })

  it('leaves presentation undefined when it is not declared', () => {
    const result = validateManifest({ ...baseManifest, ui: { hideProjectPanel: true } })
    expect(result.errors).toEqual([])
    expect(result.manifest?.ui?.presentation).toBeUndefined()
  })

  it.each(['floating', 'Popup', true, null])('refuses %j', (presentation) => {
    expect(errorsOf(uiWith(presentation))).toMatch(/^ui\.presentation: /m)
  })
})

describe('ui.sessions per-context chat fields (host: perContext, lockDown, chatPlacement, noContextText)', () => {
  const sessionsWith = (sessions: Record<string, unknown>) => ({ ...baseManifest, ui: { sessions } })

  it('accepts and keeps all four', () => {
    const sessions = { perContext: true, lockDown: false, chatPlacement: 'beside', noContextText: 'Open a record first' }
    const result = validateManifest(sessionsWith(sessions))
    expect(result.errors).toEqual([])
    expect(result.manifest?.ui?.sessions).toMatchObject(sessions)
  })

  it.each(['replace', 'beside'])('accepts chatPlacement %s', (chatPlacement) => {
    expect(validateManifest(sessionsWith({ chatPlacement })).errors).toEqual([])
  })

  it.each([
    ['perContext', 'yes'],
    ['lockDown', 1],
    ['chatPlacement', 'floating'],
    ['noContextText', ''],
    ['noContextText', 'a'.repeat(201)],
  ])('refuses %s: %j', (key, value) => {
    expect(errorsOf(sessionsWith({ [key]: value }))).toMatch(new RegExp(`^ui\\.sessions\\.${key}: `, 'm'))
  })

  it('accepts noContextText at the 200-character cap', () => {
    expect(validateManifest(sessionsWith({ noContextText: 'a'.repeat(200) })).errors).toEqual([])
  })
})

describe('ui.sessions.sidePanel (host: a right-hand Sessions panel the plugin opens)', () => {
  const sessionsWith = (sessions: Record<string, unknown>) => ({ ...baseManifest, ui: { sessions } })

  it.each([true, false])('accepts and keeps %s', (sidePanel) => {
    const result = validateManifest(sessionsWith({ sidePanel }))
    expect(result.errors).toEqual([])
    expect(result.manifest?.ui?.sessions?.sidePanel).toBe(sidePanel)
  })

  it('leaves it unset when the plugin does not declare it', () => {
    const result = validateManifest(sessionsWith({ perContext: true }))
    expect(result.errors).toEqual([])
    expect(result.manifest?.ui?.sessions?.sidePanel).toBeUndefined()
  })

  it.each(['yes', 1, null])('refuses %j', (value) => {
    expect(errorsOf(sessionsWith({ sidePanel: value }))).toMatch(/^ui\.sessions\.sidePanel: /m)
  })
})

describe('linkClaims (host: 1-20 claims of an exact host and a templated path)', () => {
  const claimsWith = (linkClaims: unknown) => ({ ...baseManifest, linkClaims })

  it('accepts and keeps a claim with a literal and a placeholder segment', () => {
    const linkClaims = [{ host: 'github.com', path: '/{owner}/{repo}/pull/{number}' }]
    const result = validateManifest(claimsWith(linkClaims))
    expect(result.errors).toEqual([])
    expect(result.manifest?.linkClaims).toEqual(linkClaims)
  })

  it('accepts 20 claims and refuses 21 or none', () => {
    const claims = Array.from({ length: 21 }, (_, i) => ({ host: 'example.com', path: `/item${i}` }))
    expect(validateManifest(claimsWith(claims.slice(0, 20))).errors).toEqual([])
    expect(errorsOf(claimsWith(claims))).toMatch(/^linkClaims: /m)
    expect(errorsOf(claimsWith([]))).toMatch(/^linkClaims: /m)
  })

  it.each([
    [{ host: '*.example.com', path: '/a' }, 'host must be an exact lowercase domain name'],
    [{ host: 'Example.com', path: '/a' }, 'host must be an exact lowercase domain name'],
    [{ host: 'example.com:8080', path: '/a' }, 'host must be an exact lowercase domain name'],
    [{ host: 'localhost', path: '/a' }, 'host must be an exact lowercase domain name'],
    [{ host: 'example.com', path: 'a' }, 'path must start with "/"'],
    [{ host: 'example.com', path: '/{id}' }, 'path needs at least one literal segment'],
    [{ host: 'example.com', path: '/a/{Id}' }, 'path segment "{Id}" must be a literal or a {placeholder}'],
    [{ host: 'example.com', path: `/${'a'.repeat(200)}` }, 'path is too long'],
  ])('refuses %j with the host reason', (claim, reason) => {
    expect(errorsOf(claimsWith([claim]))).toContain(`linkClaims: ${reason}`)
  })

  it('refuses a claim carrying a key the host does not read', () => {
    expect(validateManifest(claimsWith([{ host: 'example.com', path: '/a', query: 'x' }])).valid).toBe(false)
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

  it('refuses a process block with neither allowedCommands nor pinnedPrograms', () => {
    expect(errorsOf({ ...baseManifest, process: {} })).toMatch(
      /^process: process must list allowedCommands, pinnedPrograms, or both$/m
    )
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

describe('storage.collections.*.cliAccess (host: none, read or read-write, optional)', () => {
  const withAccess = (cliAccess: unknown) => ({
    ...baseManifest,
    storage: { collections: { notes: { columns: { title: 'text' }, cliAccess } } },
  })

  it.each(['none', 'read', 'read-write'] as const)('accepts and keeps %s', (cliAccess) => {
    const result = validateManifest(withAccess(cliAccess))
    expect(result.errors).toEqual([])
    expect(result.manifest?.storage.collections.notes?.cliAccess).toBe(cliAccess)
  })

  it.each(['readonly', 'write', 'NONE', '', true])('refuses %j rather than reading it as absent', (cliAccess) => {
    expect(errorsOf(withAccess(cliAccess))).toMatch(/^storage\.collections\.notes\.cliAccess: /m)
  })

  it('is a published type field', () => {
    const collection = { columns: { title: 'text' }, cliAccess: 'none' } satisfies PluginManifest['storage']['collections'][string]
    expect(collection.cliAccess).toBe('none')
  })
})

describe('ui.nativePanel (host: the first-party panel ids, the plugin own id, never beside entryPoint)', () => {
  const nativeManifest = (id: string, ui: Record<string, unknown>) => ({ ...withPlugin({ id }), ui })

  it('accepts workspace-hub for the plugin named workspace-hub and keeps it', () => {
    const result = validateManifest(nativeManifest('workspace-hub', { nativePanel: 'workspace-hub' }))
    expect(result.errors).toEqual([])
    expect(result.manifest?.ui?.nativePanel).toBe('workspace-hub')
  })

  it('refuses a panel id the app does not ship', () => {
    expect(errorsOf(nativeManifest('my-plugin', { nativePanel: 'my-plugin' }))).toMatch(/^ui\.nativePanel: /m)
  })

  it("refuses a panel that is not this plugin's own id, with the host message", () => {
    expect(errorsOf(nativeManifest('my-plugin', { nativePanel: 'workspace-hub' }))).toContain(
      "ui.nativePanel: ui.nativePanel must name this plugin's own id"
    )
  })

  it('refuses nativePanel beside entryPoint, with the host message', () => {
    expect(errorsOf(nativeManifest('workspace-hub', { nativePanel: 'workspace-hub', entryPoint: 'index.html' }))).toContain(
      'ui.nativePanel: ui.nativePanel and ui.entryPoint cannot both be set: a plugin draws one main panel'
    )
  })

  it('is a published type field', () => {
    const ui = { nativePanel: 'workspace-hub' } satisfies NonNullable<PluginManifest['ui']>
    expect(ui.nativePanel).toBe('workspace-hub')
  })
})

describe('process.pinnedPrograms[].source (host: marketplace, optional)', () => {
  const sha256 = 'a'.repeat(64)
  const marketplaceProgram = { name: 'ffmpeg', path: 'ffmpeg.exe', sha256, source: 'marketplace' } as const

  it('keeps source on a valid marketplace program', () => {
    const result = validateManifest({ ...baseManifest, process: { pinnedPrograms: [marketplaceProgram] } })
    expect(result.errors).toEqual([])
    expect(result.manifest?.process?.pinnedPrograms?.[0]?.source).toBe('marketplace')
  })

  it('refuses any other source', () => {
    expect(
      errorsOf({ ...baseManifest, process: { pinnedPrograms: [{ ...marketplaceProgram, source: 'plugin' }] } })
    ).toMatch(/^process\.pinnedPrograms\.0\.source: /m)
  })

  it('is a published type field', () => {
    const process = { pinnedPrograms: [marketplaceProgram] } satisfies NonNullable<PluginManifest['process']>
    expect(process.pinnedPrograms[0]?.source).toBe('marketplace')
  })
})

describe('ui.mediaControls (host: boolean, optional)', () => {
  it.each([true, false])('keeps %s', (mediaControls) => {
    const result = validateManifest({ ...baseManifest, ui: { mediaControls } })
    expect(result.errors).toEqual([])
    expect(result.manifest?.ui?.mediaControls).toBe(mediaControls)
  })

  it.each(['yes', 1, null])('refuses %j rather than reading it as absent', (mediaControls) => {
    expect(errorsOf({ ...baseManifest, ui: { mediaControls } })).toMatch(/^ui\.mediaControls: /m)
  })

  it('is a published type field', () => {
    const ui = { mediaControls: true } satisfies NonNullable<PluginManifest['ui']>
    expect(ui.mediaControls).toBe(true)
  })
})

describe('business.types.<id>.fields (host: one visibility and one disclosure per field, strict)', () => {
  const businessManifest = (fields: unknown) => ({
    ...withPlugin({ id: 'biz-ledger' }),
    business: {
      schema: 1,
      namespace: 'ledger',
      types: { invoice: { kind: 'master', version: '1', fields } },
    },
  })

  it('accepts and keeps every host enum value', () => {
    const fields = {
      total: { visibility: 'masked', disclosure: 'summary' },
      note: { visibility: 'public', disclosure: 'none' },
      memo: { visibility: 'public', disclosure: 'full' },
    }
    const result = validateManifest(businessManifest(fields))
    expect(result.errors).toEqual([])
    expect(result.manifest?.business?.types?.invoice?.fields).toEqual(fields)
  })

  it.each([
    { visibility: 'secret', disclosure: 'none' },
    { visibility: 'public', disclosure: 'some' },
    { visibility: 'public' },
    { disclosure: 'none' },
  ])('refuses %j', (field) => {
    expect(errorsOf(businessManifest({ total: field }))).toMatch(
      /^business\.types\.invoice\.fields\.total\./m
    )
  })

  it('refuses a key the host does not declare, because the field schema is strict', () => {
    expect(
      errorsOf(businessManifest({ total: { visibility: 'public', disclosure: 'none', hidden: true } }))
    ).toMatch(/^business\.types\.invoice\.fields\.total: /m)
  })

  it('is a published type field', () => {
    const fields = { total: { visibility: 'public', disclosure: 'summary' } } satisfies NonNullable<
      NonNullable<PluginManifest['business']>['types']
    >[string]['fields']
    expect(fields.total.disclosure).toBe('summary')
  })
})
