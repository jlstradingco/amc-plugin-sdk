import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { UNTYPED_BRIDGE_GAPS } from './namespace-coverage-register.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const GENERATED_TYPES = path.join(here, '..', 'generated', 'sdk-types.d.ts')
const PUBLISHED_BRIDGE = path.join(here, '..', 'types', 'bridge.ts')

const EXPOSED_FLOOR = 40
const TYPED_FLOOR = 10

function interfaceBody(file: string): string {
  const source = fs.readFileSync(file, 'utf-8')
  const start = source.indexOf('export interface AgentMC')
  expect(start, `${file} declares no AgentMC interface`).toBeGreaterThanOrEqual(0)
  const fromInterface = source.slice(start)
  const end = fromInterface.indexOf('\n}')
  expect(end, `AgentMC in ${file} has no closing brace`).toBeGreaterThan(0)
  return fromInterface.slice(0, end)
}

function exposedNamespaces(): string[] {
  const body = interfaceBody(GENERATED_TYPES)
  return [...body.matchAll(/^ {2}"([A-Za-z0-9_]+)"\s*:/gm)].map((match) => match[1]!)
}

function publishedNamespaces(): string[] {
  const body = interfaceBody(PUBLISHED_BRIDGE)
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
      `Exposed but neither typed on AgentMC (types/bridge.ts) nor listed in ` +
        `namespace-coverage-register.ts: ${unaccounted.join(', ')}. Type the namespace, or add a ` +
        `register entry explaining why it is still untyped.`
    ).toEqual([])
  })

  it('deletes a namespace from the register the moment the bridge types it', () => {
    const stale = UNTYPED_BRIDGE_GAPS.map((gap) => gap.namespace).filter((name) => publishedSet.has(name))
    expect(
      stale,
      `Typed on AgentMC but still listed as an untyped gap: ${stale.join(', ')}. ` +
        `Delete the register entry in this same change.`
    ).toEqual([])
  })

  it('types nothing on the published bridge that the host does not expose', () => {
    const exposedSet = new Set(exposed)
    const phantom = published.filter((name) => !exposedSet.has(name))
    expect(
      phantom,
      `Typed on AgentMC but not exposed to the webview: ${phantom.join(', ')}. ` +
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
