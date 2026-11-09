import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBLISHED_METHOD_GAPS, UNTYPED_BRIDGE_GAPS } from './namespace-coverage-register.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const GENERATED_TYPES = path.join(here, '..', 'generated', 'sdk-types.d.ts')
const PUBLISHED_BRIDGE = path.join(here, '..', 'types', 'bridge.ts')
const PUBLISHED_BACKEND = path.join(here, '..', 'types', 'context.ts')

const EXPOSED_FLOOR = 40
const TYPED_FLOOR = 10

function interfaceBody(file: string, name: string): string {
  const source = fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')
  const start = source.indexOf(`export interface ${name} {`)
  expect(start, `${file} declares no ${name} interface`).toBeGreaterThanOrEqual(0)
  const fromInterface = source.slice(start)
  const end = fromInterface.indexOf('\n}')
  expect(end, `${name} in ${file} has no closing brace`).toBeGreaterThan(0)
  return fromInterface.slice(0, end)
}

function exposedNamespaces(): string[] {
  const body = interfaceBody(GENERATED_TYPES, 'AgentMC')
  return [...body.matchAll(/^ {2}"([A-Za-z0-9_]+)"\s*:/gm)].map((match) => match[1]!)
}

function publishedNamespaces(): string[] {
  const body = interfaceBody(PUBLISHED_BRIDGE, 'Omniscio')
  return [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\??\s*:/gm)].map((match) => match[1]!)
}

describe('bridge namespace coverage', () => {
  const exposed = exposedNamespaces()
  const published = publishedNamespaces()
  const publishedSet = new Set(published)
  const registeredSet = new Set(UNTYPED_BRIDGE_GAPS.map((gap) => gap.namespace))

  it('reads both surfaces instead of passing on an empty comparison', () => {
    expect(exposed.length).toBeGreaterThanOrEqual(EXPOSED_FLOOR)
    expect(published.length).toBeGreaterThanOrEqual(TYPED_FLOOR)
    expect(new Set(exposed).size).toBe(exposed.length)
    expect(new Set(published).size).toBe(published.length)
  })

  it('types every exposed namespace on the published bridge or records the gap', () => {
    const unaccounted = exposed.filter((name) => !publishedSet.has(name) && !registeredSet.has(name))
    expect(
      unaccounted,
      `Exposed but neither typed on Omniscio (types/bridge.ts) nor listed in ` +
        `namespace-coverage-register.ts: ${unaccounted.join(', ')}. Type the namespace, or add a ` +
        `register entry explaining why it is still untyped.`
    ).toEqual([])
  })

  it('deletes a namespace from the register the moment the bridge types it', () => {
    const stale = UNTYPED_BRIDGE_GAPS.map((gap) => gap.namespace).filter((name) => publishedSet.has(name))
    expect(
      stale,
      `Typed on Omniscio but still listed as an untyped gap: ${stale.join(', ')}. ` +
        `Delete the register entry in this same change.`
    ).toEqual([])
  })

  it('types nothing on the published bridge that the host does not expose', () => {
    const exposedSet = new Set(exposed)
    const phantom = published.filter((name) => !exposedSet.has(name))
    expect(
      phantom,
      `Typed on Omniscio but not exposed to the webview: ${phantom.join(', ')}. ` +
        `Remove the type, or expose the namespace in the host surface.`
    ).toEqual([])
  })

  it('registers only namespaces the host actually exposes', () => {
    const exposedSet = new Set(exposed)
    const phantom = UNTYPED_BRIDGE_GAPS.map((gap) => gap.namespace).filter((name) => !exposedSet.has(name))
    expect(
      phantom,
      `Registered as an untyped gap but not exposed on the webview bridge: ${phantom.join(', ')}. ` +
        `A register entry must name a real exposed namespace.`
    ).toEqual([])
  })

  it('gives every register entry a distinct namespace and a stated reason', () => {
    expect(registeredSet.size).toBe(UNTYPED_BRIDGE_GAPS.length)
    const unexplained = UNTYPED_BRIDGE_GAPS.filter((gap) => gap.reason.trim().length === 0)
    expect(unexplained.map((gap) => gap.namespace)).toEqual([])
  })
})

function declarationText(name: string): string | null {
  for (const file of [PUBLISHED_BACKEND, PUBLISHED_BRIDGE]) {
    const source = fs.readFileSync(file, 'utf-8')
    const interfaceAt = source.indexOf(`export interface ${name} `)
    if (interfaceAt >= 0) {
      const fromInterface = source.slice(interfaceAt)
      const end = fromInterface.indexOf('\n}')
      if (end > 0) return fromInterface.slice(0, end)
    }
    const aliasAt = source.indexOf(`export type ${name} =`)
    if (aliasAt >= 0) return source.slice(aliasAt, source.indexOf('\n\n', aliasAt))
  }
  return null
}

function memberNames(body: string): string[] {
  return [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\??\s*[(:<]/gm)].map((match) => match[1]!)
}

function quotedNames(list: string): string[] {
  return [...list.matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g)].map((match) => match[1]!)
}

function methodsOfType(name: string, depth = 0): string[] | null {
  if (depth > 4) return null
  const body = declarationText(name)
  if (!body) return null
  const wrapper = /\b(Pick|Omit)<([A-Za-z][A-Za-z0-9_]*),\s*([^>]+)>/.exec(body)
  if (wrapper) {
    const base = methodsOfType(wrapper[2]!, depth + 1) ?? []
    const named = quotedNames(wrapper[3]!)
    const kept = base.filter((m) => (wrapper[1] === 'Pick' ? named.includes(m) : !named.includes(m)))
    return [...new Set([...kept, ...memberNames(body)])].sort()
  }
  const parent = /\bextends\s+([A-Za-z][A-Za-z0-9_]*)/.exec(body)
  const inherited = parent ? (methodsOfType(parent[1]!, depth + 1) ?? []) : []
  return [...new Set([...inherited, ...memberNames(body)])].sort()
}

function generatedMethods(iface: string): Record<string, string[]> {
  const body = interfaceBodyOf(GENERATED_TYPES, iface)
  const heads = [...body.matchAll(/^ {2}"([A-Za-z0-9_]+)"\s*:\s*\{$/gm)]
  const out: Record<string, string[]> = {}
  heads.forEach((head, index) => {
    const block = body.slice(head.index, index + 1 < heads.length ? heads[index + 1]!.index : body.length)
    out[head[1]!] = [...block.matchAll(/^ {4}"([A-Za-z0-9_]+)"/gm)].map((m) => m[1]!).sort()
  })
  return out
}

function publishedMethods(iface: string): Record<string, string[]> {
  const body = declarationText(iface)
  expect(body, `${iface} is not declared on the published types`).not.toBeNull()
  const out: Record<string, string[]> = {}
  for (const match of body!.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\??\s*:\s*([A-Za-z][A-Za-z0-9_]*)\s*$/gm)) {
    const methods = methodsOfType(match[2]!)
    if (methods) out[match[1]!] = methods
  }
  return out
}

function interfaceBodyOf(file: string, iface: string): string {
  const source = fs.readFileSync(file, 'utf-8')
  const start = source.indexOf(`export interface ${iface}`)
  expect(start, `${file} declares no ${iface} interface`).toBeGreaterThanOrEqual(0)
  const fromInterface = source.slice(start)
  const end = fromInterface.indexOf('\n}')
  expect(end, `${iface} in ${file} has no closing brace`).toBeGreaterThan(0)
  return fromInterface.slice(0, end)
}

interface MethodDrift {
  surface: 'backend' | 'webview'
  namespace: string
  generatedOnly: string[]
  publishedOnly: string[]
}

function methodDrift(
  surface: 'backend' | 'webview',
  generated: Record<string, string[]>,
  published: Record<string, string[]>,
  registeredNamespaces: ReadonlySet<string>
): MethodDrift[] {
  const drift: MethodDrift[] = []
  for (const namespace of Object.keys(generated)) {
    if (!(namespace in published)) {
      if (registeredNamespaces.has(namespace)) continue
      drift.push({ surface, namespace, generatedOnly: generated[namespace]!, publishedOnly: [] })
      continue
    }
    const generatedOnly = generated[namespace]!.filter((m) => !published[namespace]!.includes(m))
    const publishedOnly = published[namespace]!.filter((m) => !generated[namespace]!.includes(m))
    if (generatedOnly.length > 0 || publishedOnly.length > 0) {
      drift.push({ surface, namespace, generatedOnly, publishedOnly })
    }
  }
  return drift.sort((a, b) => a.namespace.localeCompare(b.namespace))
}

describe('bridge method coverage', () => {
  const untypedSet = new Set(UNTYPED_BRIDGE_GAPS.map((gap) => gap.namespace))
  const surfaces: Array<{ surface: 'backend' | 'webview'; generatedIface: string; publishedIface: string }> = [
    { surface: 'backend', generatedIface: 'PluginContext', publishedIface: 'PluginContext' },
    { surface: 'webview', generatedIface: 'AgentMC', publishedIface: 'Omniscio' }
  ]

  it('reads real method names off both sheets instead of comparing two empty lists', () => {
    const generated = generatedMethods('PluginContext')
    const published = publishedMethods('PluginContext')
    expect(Object.keys(generated).length).toBeGreaterThanOrEqual(20)
    expect(Object.keys(published).length).toBeGreaterThanOrEqual(20)
    expect(generated.settings).toContain('set')
    expect(published.settings).toContain('set')
  })

  for (const { surface, generatedIface, publishedIface } of surfaces) {
    it(`types the same actions as the host on every ${surface} namespace`, () => {
      const drift = methodDrift(surface, generatedMethods(generatedIface), publishedMethods(publishedIface), untypedSet)
      const registered = PUBLISHED_METHOD_GAPS.filter((gap) => gap.surface === surface)
      const unexplained = drift.filter(
        (item) =>
          !registered.some(
            (gap) =>
              gap.namespace === item.namespace &&
              gap.generatedOnly.join(',') === item.generatedOnly.join(',') &&
              gap.publishedOnly.join(',') === item.publishedOnly.join(',')
          )
      )
      expect(
        unexplained,
        `Actions that exist on one published surface and not the other. Type them, or add a ` +
          `published-method register entry explaining the difference: ${JSON.stringify(unexplained)}`
      ).toEqual([])
    })
  }

  it('deletes a method register entry the moment the two sheets agree', () => {
    const drift = surfaces.flatMap(({ surface, generatedIface, publishedIface }) =>
      methodDrift(surface, generatedMethods(generatedIface), publishedMethods(publishedIface), untypedSet)
    )
    const stale = PUBLISHED_METHOD_GAPS.filter(
      (gap) =>
        !drift.some(
          (item) =>
            item.surface === gap.surface &&
            item.namespace === gap.namespace &&
            item.generatedOnly.join(',') === gap.generatedOnly.join(',') &&
            item.publishedOnly.join(',') === gap.publishedOnly.join(',')
        )
    )
    expect(
      stale.map((gap) => `${gap.surface}.${gap.namespace}`),
      'Registered as a method gap but the published types now agree. Delete the register entry.'
    ).toEqual([])
  })

  it('gives every method register entry a stated reason', () => {
    expect(PUBLISHED_METHOD_GAPS.filter((gap) => gap.reason.trim().length === 0)).toEqual([])
  })
})
