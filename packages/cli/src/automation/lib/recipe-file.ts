import * as fs from 'node:fs'
import * as path from 'node:path'

/** An author-facing file problem: always carries a remedy, never a raw errno. */
export class RecipeFileError extends Error {
  suggestion: string
  constructor(message: string, suggestion: string) {
    super(message)
    this.name = 'RecipeFileError'
    this.suggestion = suggestion
  }
}

export interface LoadedRecipe {
  path: string
  raw: string
  recipe: Record<string, unknown>
}

const RECIPE_SUFFIX = '.recipe.json'

export function findRecipeFiles(dir: string): string[] {
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return []
  }
  return entries
    .filter((e) => e.endsWith(RECIPE_SUFFIX))
    .sort()
    .map((e) => path.join(dir, e))
}

/**
 * Pick the recipe to act on. Ambiguity is an ERROR that names every candidate —
 * silently picking one would publish the wrong automation.
 */
export function resolveRecipePath(dir: string, explicit?: string): string {
  if (explicit) {
    const resolved = path.isAbsolute(explicit) ? explicit : path.join(dir, explicit)
    if (!fs.existsSync(resolved)) {
      throw new RecipeFileError(
        `No recipe file at ${resolved}`,
        'Check the path, or omit it to use the one in the current directory.'
      )
    }
    return resolved
  }

  const found = findRecipeFiles(dir)
  if (found.length === 1) return found[0]!
  if (found.length === 0) {
    throw new RecipeFileError(
      `No ${RECIPE_SUFFIX} file found in ${dir}`,
      "Run 'amc-automation init <name>' to scaffold one."
    )
  }
  const names = found.map((f) => path.basename(f)).join(', ')
  throw new RecipeFileError(
    `More than one ${RECIPE_SUFFIX} file found in ${dir}`,
    `Pass the one you mean explicitly. Found: ${names}`
  )
}

export function loadRecipe(filePath: string): LoadedRecipe {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf-8')
  } catch {
    throw new RecipeFileError(
      `Could not read ${path.basename(filePath)}`,
      'Check the file exists and is readable.'
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new RecipeFileError(
      `${path.basename(filePath)} is not valid JSON`,
      'Open it in an editor — a trailing comma or unquoted key is the usual cause.'
    )
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new RecipeFileError(
      `${path.basename(filePath)} must contain a JSON object`,
      'The top level should be { "name": ..., "steps": [...] }.'
    )
  }

  return { path: filePath, raw, recipe: parsed as Record<string, unknown> }
}
