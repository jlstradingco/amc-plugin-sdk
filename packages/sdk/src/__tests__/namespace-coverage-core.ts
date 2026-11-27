export interface UntypedNamespaceGap {
  readonly namespace: string
  readonly reason: string
}

export interface NamespaceSurfaces {
  readonly exposed: readonly string[]
  readonly published: readonly string[]
  readonly registered: readonly UntypedNamespaceGap[]
}

export interface NamespaceCoverageDrift {
  readonly untyped: string[]
  readonly staleRegister: string[]
  readonly phantomTyped: string[]
  readonly phantomRegistered: string[]
  readonly duplicated: string[]
  readonly unexplained: string[]
  readonly empty: boolean
}

function duplicatesOf(names: readonly string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) repeated.add(name)
    seen.add(name)
  }
  return [...repeated]
}

export function namespaceCoverageDrift(surfaces: NamespaceSurfaces): NamespaceCoverageDrift {
  const exposed = [...(surfaces.exposed ?? [])]
  const published = [...(surfaces.published ?? [])]
  const registered = [...(surfaces.registered ?? [])]
  const exposedSet = new Set(exposed)
  const publishedSet = new Set(published)
  const registeredNames = registered.map((gap) => gap.namespace)
  const registeredSet = new Set(registeredNames)
  return {
    untyped: exposed.filter((name) => !publishedSet.has(name) && !registeredSet.has(name)),
    staleRegister: registeredNames.filter((name) => publishedSet.has(name)),
    phantomTyped: published.filter((name) => !exposedSet.has(name)),
    phantomRegistered: registeredNames.filter((name) => !exposedSet.has(name)),
    duplicated: [...duplicatesOf(exposed), ...duplicatesOf(published), ...duplicatesOf(registeredNames)],
    unexplained: registered.filter((gap) => gap.reason.trim().length === 0).map((gap) => gap.namespace),
    empty: exposed.length === 0 || published.length === 0
  }
}

export function isNamespaceCoverageClean(drift: NamespaceCoverageDrift): boolean {
  return (
    !drift.empty &&
    drift.untyped.length === 0 &&
    drift.staleRegister.length === 0 &&
    drift.phantomTyped.length === 0 &&
    drift.phantomRegistered.length === 0 &&
    drift.duplicated.length === 0 &&
    drift.unexplained.length === 0
  )
}

export type MethodSurface = 'backend' | 'webview'

export interface PublishedMethodGapEntry {
  readonly surface: MethodSurface
  readonly namespace: string
  readonly generatedOnly: readonly string[]
  readonly publishedOnly: readonly string[]
  readonly reason: string
}

export interface MethodDrift {
  readonly surface: MethodSurface
  readonly namespace: string
  readonly generatedOnly: string[]
  readonly publishedOnly: string[]
}

export const METHOD_SURFACES: ReadonlyArray<{
  readonly surface: MethodSurface
  readonly generatedIface: string
  readonly publishedIface: string
}> = [
  { surface: 'backend', generatedIface: 'PluginContext', publishedIface: 'PluginContext' },
  { surface: 'webview', generatedIface: 'AgentMC', publishedIface: 'Omniscio' }
]

const MAX_TYPE_DEPTH = 4

function normalized(source: string): string {
  return source.replace(/\r\n/g, '\n')
}

export function interfaceBodyIn(source: string, iface: string): string | null {
  const text = normalized(source)
  const start = text.indexOf(`export interface ${iface} `)
  if (start < 0) return null
  const fromInterface = text.slice(start)
  const end = fromInterface.indexOf('\n}')
  return end > 0 ? fromInterface.slice(0, end) : null
}

function declarationText(sources: readonly string[], name: string): string | null {
  for (const source of sources) {
    const body = interfaceBodyIn(source, name)
    if (body !== null) return body
    const text = normalized(source)
    const aliasAt = text.indexOf(`export type ${name} =`)
    if (aliasAt >= 0) return text.slice(aliasAt, text.indexOf('\n\n', aliasAt))
  }
  return null
}

function memberNames(body: string): string[] {
  return [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\??\s*[(:<]/gm)].map((match) => match[1]!)
}

function quotedNames(list: string): string[] {
  return [...list.matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g)].map((match) => match[1]!)
}

function methodsOfType(sources: readonly string[], name: string, depth = 0): string[] | null {
  if (depth > MAX_TYPE_DEPTH) return null
  const body = declarationText(sources, name)
  if (!body) return null
  const wrapper = /\b(Pick|Omit)<([A-Za-z][A-Za-z0-9_]*),\s*([^>]+)>/.exec(body)
  if (wrapper) {
    const base = methodsOfType(sources, wrapper[2]!, depth + 1) ?? []
    const named = quotedNames(wrapper[3]!)
    const kept = base.filter((m) => (wrapper[1] === 'Pick' ? named.includes(m) : !named.includes(m)))
    return [...new Set([...kept, ...memberNames(body)])].sort()
  }
  const parent = /\bextends\s+([A-Za-z][A-Za-z0-9_]*)/.exec(body)
  const inherited = parent ? (methodsOfType(sources, parent[1]!, depth + 1) ?? []) : []
  return [...new Set([...inherited, ...memberNames(body)])].sort()
}

export function generatedMethods(generatedSource: string, iface: string): Record<string, string[]> | null {
  const body = interfaceBodyIn(generatedSource, iface)
  if (body === null) return null
  const heads = [...body.matchAll(/^ {2}"([A-Za-z0-9_]+)"\s*:\s*\{$/gm)]
  const out: Record<string, string[]> = {}
  heads.forEach((head, index) => {
    const block = body.slice(head.index, index + 1 < heads.length ? heads[index + 1]!.index : body.length)
    out[head[1]!] = [...block.matchAll(/^ {4}"([A-Za-z0-9_]+)"/gm)].map((m) => m[1]!).sort()
  })
  return out
}

export function publishedMethods(
  publishedSources: readonly string[],
  iface: string
): Record<string, string[]> | null {
  const body = declarationText(publishedSources, iface)
  if (body === null) return null
  const out: Record<string, string[]> = {}
  for (const match of body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\??\s*:\s*([A-Za-z][A-Za-z0-9_]*)\s*$/gm)) {
    const methods = methodsOfType(publishedSources, match[2]!)
    if (methods) out[match[1]!] = methods
  }
  return out
}

export function methodDrift(
  surface: MethodSurface,
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

function sameGap(drift: MethodDrift, gap: PublishedMethodGapEntry): boolean {
  return (
    drift.surface === gap.surface &&
    drift.namespace === gap.namespace &&
    drift.generatedOnly.join(',') === gap.generatedOnly.join(',') &&
    drift.publishedOnly.join(',') === gap.publishedOnly.join(',')
  )
}

export interface MethodSheets {
  readonly generatedSource: string
  readonly publishedSources: readonly string[]
  readonly untyped: readonly UntypedNamespaceGap[]
  readonly gaps: readonly PublishedMethodGapEntry[]
}

export interface MethodCoverage {
  readonly unreadable: string[]
  readonly drift: MethodDrift[]
  readonly unexplained: MethodDrift[]
  readonly staleGaps: PublishedMethodGapEntry[]
  readonly unreasonedGaps: PublishedMethodGapEntry[]
}

export function methodCoverage(sheets: MethodSheets): MethodCoverage {
  const untypedSet = new Set(sheets.untyped.map((gap) => gap.namespace))
  const unreadable: string[] = []
  const drift = METHOD_SURFACES.flatMap(({ surface, generatedIface, publishedIface }) => {
    const generated = generatedMethods(sheets.generatedSource, generatedIface)
    const published = publishedMethods(sheets.publishedSources, publishedIface)
    if (generated === null) unreadable.push(`generated ${generatedIface}`)
    if (published === null) unreadable.push(`published ${publishedIface}`)
    if (generated === null || published === null) return []
    return methodDrift(surface, generated, published, untypedSet)
  })
  return {
    unreadable,
    drift,
    unexplained: drift.filter((item) => !sheets.gaps.some((gap) => sameGap(item, gap))),
    staleGaps: sheets.gaps.filter((gap) => !drift.some((item) => sameGap(item, gap))),
    unreasonedGaps: sheets.gaps.filter((gap) => gap.reason.trim().length === 0)
  }
}
