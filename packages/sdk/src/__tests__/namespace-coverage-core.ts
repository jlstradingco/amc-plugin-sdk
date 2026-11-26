/**
 * The ONE rule for bridge-namespace coverage, shared by the kit's own spec (which the mirror runs)
 * and by the host's merge-gate check (which this repository runs). Both sides read their files
 * themselves and hand the three lists here, so the two can never drift into disagreeing verdicts.
 *
 * A surface is `exposed` when the generated `AgentMC` interface offers it to the webview,
 * `published` when the hand-written `Omniscio` interface types it, and `registered` when the gap
 * register names it with a reason (a namespace reserved to one plugin, which no general type may
 * describe).
 */
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
  /** Exposed to the webview but neither typed nor registered: an author cannot type a call the app answers. */
  readonly untyped: string[]
  /** Still registered as an untyped gap but the bridge now types it: the register must shrink. */
  readonly staleRegister: string[]
  /** Typed on the bridge but the host exposes nothing by that name. */
  readonly phantomTyped: string[]
  /** Registered as a gap but the host exposes nothing by that name. */
  readonly phantomRegistered: string[]
  /** The same namespace listed more than once where it must be unique. */
  readonly duplicated: string[]
  /** A register entry with no stated reason. */
  readonly unexplained: string[]
  /** One of the compared surfaces read as empty — a pass over nothing is not a pass. */
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
