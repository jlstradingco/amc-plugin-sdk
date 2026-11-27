import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBLISHED_METHOD_GAPS, UNTYPED_BRIDGE_GAPS } from './namespace-coverage-register.js'
import {
  METHOD_SURFACES,
  generatedMethods,
  methodCoverage,
  namespaceCoverageDrift,
  publishedMethods
} from './namespace-coverage-core.js'

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
  const drift = namespaceCoverageDrift({ exposed, published, registered: UNTYPED_BRIDGE_GAPS })

  it('reads both surfaces instead of passing on an empty comparison', () => {
    expect(exposed.length).toBeGreaterThanOrEqual(EXPOSED_FLOOR)
    expect(published.length).toBeGreaterThanOrEqual(TYPED_FLOOR)
    expect(drift.empty).toBe(false)
    expect(drift.duplicated).toEqual([])
  })

  it('types every exposed namespace on the published bridge or records the gap', () => {
    expect(
      drift.untyped,
      `Exposed but neither typed on Omniscio (types/bridge.ts) nor listed in ` +
        `namespace-coverage-register.ts: ${drift.untyped.join(', ')}. Type the namespace, or add a ` +
        `register entry explaining why it is still untyped.`
    ).toEqual([])
  })

  it('deletes a namespace from the register the moment the bridge types it', () => {
    expect(
      drift.staleRegister,
      `Typed on Omniscio but still listed as an untyped gap: ${drift.staleRegister.join(', ')}. ` +
        `Delete the register entry in this same change.`
    ).toEqual([])
  })

  it('types nothing on the published bridge that the host does not expose', () => {
    expect(
      drift.phantomTyped,
      `Typed on Omniscio but not exposed to the webview: ${drift.phantomTyped.join(', ')}. ` +
        `Remove the type, or expose the namespace in the host surface.`
    ).toEqual([])
  })

  it('registers only namespaces the host actually exposes', () => {
    expect(
      drift.phantomRegistered,
      `Registered as an untyped gap but not exposed on the webview bridge: ${drift.phantomRegistered.join(', ')}. ` +
        `A register entry must name a real exposed namespace.`
    ).toEqual([])
  })

  it('gives every register entry a distinct namespace and a stated reason', () => {
    expect(drift.duplicated).toEqual([])
    expect(drift.unexplained).toEqual([])
  })
})

function methodSheets() {
  return {
    generatedSource: fs.readFileSync(GENERATED_TYPES, 'utf-8'),
    publishedSources: [PUBLISHED_BACKEND, PUBLISHED_BRIDGE].map((file) => fs.readFileSync(file, 'utf-8')),
    untyped: UNTYPED_BRIDGE_GAPS,
    gaps: PUBLISHED_METHOD_GAPS
  }
}

describe('bridge method coverage', () => {
  const sheets = methodSheets()
  const coverage = methodCoverage(sheets)

  it('reads real method names off both sheets instead of comparing two empty lists', () => {
    const generated = generatedMethods(sheets.generatedSource, 'PluginContext') ?? {}
    const published = publishedMethods(sheets.publishedSources, 'PluginContext') ?? {}
    expect(coverage.unreadable).toEqual([])
    expect(Object.keys(generated).length).toBeGreaterThanOrEqual(20)
    expect(Object.keys(published).length).toBeGreaterThanOrEqual(20)
    expect(generated.settings).toContain('set')
    expect(published.settings).toContain('set')
  })

  for (const { surface } of METHOD_SURFACES) {
    it(`types the same actions as the host on every ${surface} namespace`, () => {
      const unexplained = coverage.unexplained.filter((item) => item.surface === surface)
      expect(
        unexplained,
        `Actions that exist on one published surface and not the other. Type them, or add a ` +
          `published-method register entry explaining the difference: ${JSON.stringify(unexplained)}`
      ).toEqual([])
    })
  }

  it('deletes a method register entry the moment the two sheets agree', () => {
    expect(
      coverage.staleGaps.map((gap) => `${gap.surface}.${gap.namespace}`),
      'Registered as a method gap but the published types now agree. Delete the register entry.'
    ).toEqual([])
  })

  it('gives every method register entry a stated reason', () => {
    expect(coverage.unreasonedGaps).toEqual([])
  })
})
