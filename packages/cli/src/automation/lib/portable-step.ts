/**
 * The allow-list applied INSIDE a step, mirroring AMC's own `pickPortableStep`.
 *
 * `envelope.ts` filters the recipe's TOP level to `SHAREABLE_FIELDS`, and says of
 * that list: "anything not named here simply does not travel". That guarantee used
 * to stop at the top level — `steps` and `pipelines` rode the envelope VERBATIM, so
 * every field an author's step happened to carry was published to a world-readable
 * catalog. AMC's share path never had that hole: `buildSharedAutomation` maps every
 * step (top-level and pipeline alike) through a 21-field allow-list before the
 * envelope is built.
 *
 * The gap was reachable by the ordinary workflow. An author who copies a recipe out
 * of AMC to edit it as a file starts from a step object carrying whatever the local
 * recipe had — ids, local project references, engine pins — and none of it was
 * stripped. The four fields the local checks DO reject (`script`, `subRecipe`,
 * `promptFile`, `targetProjectId`) were a deny-list of four, not an allow-list of
 * twenty-one, and a deny-list only excludes what it thought to name.
 *
 * SOURCE OF TRUTH (host repo): Agent Orchestrator
 *   src/shared/automation-share.ts — `STEP_ALLOW_LIST`, keyed on
 *   `keyof SharedAutomationStep & keyof RecipeStep` so the host's own list is
 *   compiler-tied to its step type. This CLI cannot import that type, so the list is
 *   vendored and pinned by a test instead.
 *
 * Last reconciled: 2026-07-27 against src/shared/automation-share.ts.
 */

/**
 * Step fields that travel. Mirrors the host's `STEP_ALLOW_LIST` exactly, in the
 * host's own order so the two read side by side.
 */
export const SHAREABLE_STEP_FIELDS = [
  'name',
  'prompt',
  'kind',
  'followUp',
  'waitForPrevious',
  'injectPriorOutputs',
  'serialDispatch',
  'waveMaxConcurrent',
  'waveMaxRetries',
  'setsVars',
  'runWhen',
  'exitWhen',
  'exitMessage',
  'onError',
  'forEach',
  'approvalGate',
  'output',
  'expand',
  'supervisor',
  'completionCheck',
  'timeoutMinutes'
] as const

const SHAREABLE_STEP_FIELD_SET: ReadonlySet<string> = new Set<string>(SHAREABLE_STEP_FIELDS)

/** Is this a plain object, i.e. something whose fields can be picked? */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Copy only the shareable fields off a step.
 *
 * Deliberately TOTAL where the host's version throws: AMC's `pickPortableStep`
 * rejects a step missing its `name`, because on that path a missing name is an
 * internal invariant break. Here it is ordinary author input — `checkSteps` already
 * reports it as an error, and `--skip-validation` is a documented way past that — so
 * throwing would replace a clear finding with a stack trace. The envelope stays
 * buildable and the server's own "A step is missing its name" remains the backstop.
 */
export function pickPortableStep(step: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of SHAREABLE_STEP_FIELDS) {
    if (step[field] !== undefined) out[field] = step[field]
  }
  return out
}

/** Apply the step allow-list across an array, skipping entries that are not objects. */
export function pickPortableSteps(steps: unknown): Record<string, unknown>[] {
  if (!Array.isArray(steps)) return []
  return steps.filter(isPlainObject).map(pickPortableStep)
}

/**
 * Keys that cannot be copied onto a plain object by assignment.
 *
 * A pipeline name is the one attacker-or-typo-controlled KEY in the envelope, and
 * `JSON.parse` creates `__proto__` as an ordinary own enumerable property — so
 * `out[name] = steps` for a pipeline named `__proto__` hits the prototype SETTER
 * instead of adding a key. The pipeline then vanishes from the output and the
 * container is left with an attacker-chosen prototype, which is then handed to
 * `JSON.stringify` and on to the server.
 *
 * It is not privilege escalation — `Object.prototype` itself is untouched — but it is
 * silent data loss and a malformed object, out of a function whose entire job is to
 * copy exactly the allow-listed data and nothing else. Skipped deliberately and
 * loudly rather than left to the setter.
 */
const UNSAFE_PIPELINE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Apply the step allow-list across a `pipelines` map, preserving its keys.
 *
 * A pipeline whose value is not an array is dropped rather than passed through: the
 * envelope's whole contract is that what it emits has a known shape, and forwarding
 * an unrecognized value would hand the server something this CLI never inspected.
 */
export function pickPortablePipelines(pipelines: unknown): Record<string, Record<string, unknown>[]> {
  if (!isPlainObject(pipelines)) return {}
  const out: Record<string, Record<string, unknown>[]> = {}
  for (const [name, steps] of Object.entries(pipelines)) {
    if (!Array.isArray(steps)) continue
    if (UNSAFE_PIPELINE_KEYS.has(name)) continue
    out[name] = pickPortableSteps(steps)
  }
  return out
}

/**
 * Every field name the allow-list would strip, across all steps, deduplicated and
 * sorted.
 *
 * Silent stripping is the wrong shape for an author-facing tool: a field that
 * vanishes between the file on disk and the published automation should be NAMED, or
 * the author debugs its absence against a catalog they cannot see into. AMC reports
 * the same thing as its "removed" list at share time; `checks/stripped-fields.ts`
 * turns this into one advisory finding.
 */
export function collectStrippedStepFields(steps: Iterable<Record<string, unknown>>): string[] {
  const stripped = new Set<string>()
  for (const step of steps) {
    for (const key of Object.keys(step)) {
      if (!SHAREABLE_STEP_FIELD_SET.has(key)) stripped.add(key)
    }
  }
  return [...stripped].sort()
}
