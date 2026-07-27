/**
 * One place that knows where a recipe keeps its steps.
 *
 * A recipe holds steps in TWO places: the top-level `steps` array, and the named
 * arrays under `pipelines` (`Record<string, Step[]>`). Both are published — the
 * publish envelope's allow-list carries `pipelines` verbatim — but the local checks
 * only ever walked `steps`, so a script step or a pasted API key inside a pipeline
 * was shipped with no warning from either the CLI or the server. AMC's own
 * automation-share.ts walks both; this brings the CLI in line.
 *
 * Every check that reasons about steps goes through here, so a third location can
 * never be added in one check and forgotten in the others.
 */

/** A step, plus where it was found. */
export interface LocatedStep {
  step: Record<string, unknown>
  /**
   * What to call this step in a message. The author's own `name` when they gave
   * one, otherwise a positional label they can find the step by.
   */
  label: string
  /**
   * Field path prefix for pinpointing a value, e.g. `steps[0]` or
   * `pipelines.review[2]`. Matches the shape AMC's own share-time scanner uses.
   */
  path: string
  /** The author's `name`, when it is a usable one. Undefined otherwise. */
  declaredName?: string
}

function isStepObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function declaredNameOf(step: Record<string, unknown>): string | undefined {
  return typeof step.name === 'string' && step.name.trim().length > 0 ? step.name : undefined
}

/** The top-level `steps` array only. */
export function collectTopLevelSteps(recipe: Record<string, unknown>): LocatedStep[] {
  const steps = Array.isArray(recipe.steps) ? recipe.steps : []
  const located: LocatedStep[] = []

  steps.forEach((step, index) => {
    if (!isStepObject(step)) return
    const declaredName = declaredNameOf(step)
    located.push({
      step,
      declaredName,
      label: declaredName ?? `step ${index + 1}`,
      path: `steps[${index}]`
    })
  })

  return located
}

/** Every named pipeline's steps, in a stable order so output does not shuffle. */
export function collectPipelineSteps(recipe: Record<string, unknown>): LocatedStep[] {
  const pipelines = recipe.pipelines
  if (!isStepObject(pipelines)) return []

  const located: LocatedStep[] = []

  // Sorted by pipeline name: object key order is insertion order, which is JSON
  // file order, which changes when an author reorders their file. Findings should
  // not shuffle for that.
  for (const pipelineName of Object.keys(pipelines).sort()) {
    const steps = pipelines[pipelineName]
    if (!Array.isArray(steps)) continue

    steps.forEach((step, index) => {
      if (!isStepObject(step)) return
      const declaredName = declaredNameOf(step)
      const path = `pipelines.${pipelineName}[${index}]`
      located.push({
        step,
        declaredName,
        // A pipeline step's own name is not unique across pipelines, so the label
        // always says which pipeline it came from.
        label: declaredName ? `${declaredName} (in pipeline "${pipelineName}")` : path,
        path
      })
    })
  }

  return located
}

/** Every step a publish would ship, top-level first, then the pipelines. */
export function collectAllSteps(recipe: Record<string, unknown>): LocatedStep[] {
  return [...collectTopLevelSteps(recipe), ...collectPipelineSteps(recipe)]
}
