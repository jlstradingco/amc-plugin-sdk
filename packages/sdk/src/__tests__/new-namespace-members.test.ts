import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(here, '../../../../..')
const PRELOAD_SURFACE = path.join(REPO_ROOT, 'src', 'shared', 'plugin-capabilities', 'preload-surface.generated.ts')
const WORKER_CTX_SURFACE = path.join(REPO_ROOT, 'src', 'shared', 'plugin-worker-ctx-surface.ts')
const BRIDGE_TYPES = path.join(here, '..', 'types', 'bridge.ts')
const CONTEXT_TYPES = path.join(here, '..', 'types', 'context.ts')

const BRIDGE_INTERFACES: Readonly<Record<string, string>> = {
  boardLinks: 'BridgeBoardLinks',
  boards: 'BridgeBoards',
  clipboard: 'BridgeClipboard',
  members: 'BridgeMembers',
  navigation: 'BridgeNavigation',
  notifications: 'BridgeNotifications',
  process: 'BridgeProcess',
  share: 'BridgeShare',
  shell: 'BridgeShell'
}

const CONTEXT_INTERFACES: Readonly<Record<string, string>> = {
  members: 'PluginMembers',
  channel: 'PluginChannel',
  launch: 'PluginLaunch',
  oauth: 'PluginOAuth',
  rss: 'PluginRss'
}

function readRepoFile(file: string, what: string): string {
  expect(
    fs.existsSync(file),
    `${what} not found at ${file}. This test compares the SDK's types with the host's own surface, ` +
      `so it needs the Omniscio repo around plugin-sdk/ (repo root resolved as ${REPO_ROOT}).`
  ).toBe(true)
  return fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')
}

function interfaceMethods(source: string, file: string, name: string): string[] {
  const start = source.indexOf(`export interface ${name} {`)
  expect(start, `${file} declares no ${name} interface`).toBeGreaterThanOrEqual(0)
  const fromInterface = source.slice(start)
  const end = fromInterface.indexOf('\n}')
  expect(end, `${name} in ${file} has no closing brace`).toBeGreaterThan(0)
  const body = fromInterface.slice(0, end)
  return [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\s*[(<]/gm)].map((match) => match[1]!)
}

function hostWebviewMethods(preloadSource: string, namespace: string): string[] {
  const calls = [...preloadSource.matchAll(/\["([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)",\s*-?\d+\]/g)]
    .filter((match) => match[1] === namespace)
    .map((match) => match[2]!)
  const specials = [
    ...preloadSource.matchAll(/namespace:\s*"([A-Za-z0-9_]+)",\s*method:\s*"([A-Za-z0-9_]+)"/g)
  ]
    .filter((match) => match[1] === namespace)
    .map((match) => match[2]!)
  return [...new Set([...calls, ...specials])]
}

function hostWorkerMethods(workerSource: string, namespace: string): string[] {
  const row = new RegExp(`members\\('${namespace}',\\s*'[a-z]+',\\s*\\[([^\\]]*)\\]`)
  const match = workerSource.match(row)
  if (!match) return []
  return [...match[1]!.matchAll(/'([A-Za-z0-9_]+)'/g)].map((entry) => entry[1]!)
}

function expectEqualSets(label: string, declared: string[], exposed: string[]): void {
  const declaredSet = new Set(declared)
  const exposedSet = new Set(exposed)
  const missing = [...exposedSet].filter((name) => !declaredSet.has(name)).sort()
  const extra = [...declaredSet].filter((name) => !exposedSet.has(name)).sort()
  expect(declared.length, `${label}: declares a method twice`).toBe(declaredSet.size)
  expect(
    { missing, extra },
    `${label}: the SDK type and the host disagree. missing from the SDK type (host exposes it): ` +
      `[${missing.join(', ')}]; extra in the SDK type (host does not expose it): [${extra.join(', ')}]`
  ).toEqual({ missing: [], extra: [] })
}

describe('webview bridge namespaces added to Omniscio', () => {
  const preload = readRepoFile(PRELOAD_SURFACE, 'The host preload surface')
  const bridge = readRepoFile(BRIDGE_TYPES, 'types/bridge.ts')

  it('reads the host surface instead of passing on an empty comparison', () => {
    for (const namespace of Object.keys(BRIDGE_INTERFACES)) {
      expect(
        hostWebviewMethods(preload, namespace).length,
        `no methods found for ${namespace} in preload-surface.generated.ts`
      ).toBeGreaterThan(0)
    }
  })

  for (const [namespace, interfaceName] of Object.entries(BRIDGE_INTERFACES)) {
    it(`${namespace}: ${interfaceName} declares exactly the methods the host exposes`, () => {
      expectEqualSets(
        `Omniscio.${namespace} (${interfaceName})`,
        interfaceMethods(bridge, BRIDGE_TYPES, interfaceName),
        hostWebviewMethods(preload, namespace)
      )
    })

    it(`${namespace}: Omniscio declares the member as ${interfaceName}`, () => {
      const member = new RegExp(`^ {2}${namespace}: ${interfaceName}$`, 'm')
      expect(bridge, `Omniscio has no "${namespace}: ${interfaceName}" member`).toMatch(member)
    })
  }
})

describe('worker context namespaces added to PluginContext', () => {
  const workerSurface = readRepoFile(WORKER_CTX_SURFACE, 'The host worker context surface')
  const context = readRepoFile(CONTEXT_TYPES, 'types/context.ts')

  it('reads the host surface instead of passing on an empty comparison', () => {
    for (const namespace of Object.keys(CONTEXT_INTERFACES)) {
      expect(
        hostWorkerMethods(workerSurface, namespace).length,
        `no methods found for ${namespace} in plugin-worker-ctx-surface.ts`
      ).toBeGreaterThan(0)
    }
  })

  for (const [namespace, interfaceName] of Object.entries(CONTEXT_INTERFACES)) {
    it(`${namespace}: ${interfaceName} declares exactly the methods the worker exposes`, () => {
      expectEqualSets(
        `ctx.${namespace} (${interfaceName})`,
        interfaceMethods(context, CONTEXT_TYPES, interfaceName),
        hostWorkerMethods(workerSurface, namespace)
      )
    })

    it(`${namespace}: PluginContext declares the member as ${interfaceName}`, () => {
      const member = new RegExp(`^ {2}${namespace}\\?: ${interfaceName}$`, 'm')
      expect(context, `PluginContext has no "${namespace}?: ${interfaceName}" member`).toMatch(member)
    })
  }

  it('keeps the two ctx.process event subscriptions the worker really delivers', () => {
    const declared = interfaceMethods(context, CONTEXT_TYPES, 'PluginProcess')
    for (const method of ['onOutput', 'onExit']) {
      expect(workerSurface, `the worker surface no longer lists process.${method}`).toContain(
        `path: 'process.${method}'`
      )
      expect(declared, `PluginProcess dropped ${method}, which the worker still delivers`).toContain(method)
    }
  })
})
