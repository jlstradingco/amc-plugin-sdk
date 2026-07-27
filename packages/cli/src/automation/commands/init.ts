import { Command } from 'commander'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildTemplateRecipe, buildTemplateReadme } from '../lib/template.js'
import {
  deriveAutomationId,
  AUTOMATION_CATEGORIES,
  type AutomationCategory
} from '../lib/envelope.js'
import { isValidCategory } from '../lib/publish-inputs.js'
import { ok, info, filePath } from '../../lib/output.js'

export interface InitOptions {
  name: string
  cwd: string
  description?: string
  category?: AutomationCategory
  force?: boolean
}

export function runInit(opts: InitOptions): { recipePath: string; readmePath: string } {
  // Through the shared predicate, not a second `includes` call. `init` validating its
  // own `--category` by hand is the duplication `publish-inputs.ts` was extracted to
  // end — the same flag was checked in one command and trusted in the other two, and
  // a hand-rolled copy is exactly how they drifted apart in the first place.
  const category = opts.category ?? 'other'
  if (!isValidCategory(category)) {
    throw new Error(
      `"${category}" is not a valid category. Use one of: ${AUTOMATION_CATEGORIES.join(', ')}.`
    )
  }

  const slug = deriveAutomationId(opts.name)
  const fileName = `${slug}.recipe.json`
  const recipePath = path.join(opts.cwd, fileName)
  const readmePath = path.join(opts.cwd, 'README.md')

  if (fs.existsSync(recipePath) && !opts.force) {
    throw new Error(`${fileName} already exists. Pass --force to overwrite it.`)
  }

  const recipe = buildTemplateRecipe({
    name: opts.name,
    description: opts.description ?? `The ${opts.name} automation.`,
    category
  })

  fs.writeFileSync(recipePath, `${JSON.stringify(recipe, null, 2)}\n`, 'utf-8')
  // Never clobber an existing README without --force; the author may have
  // written it themselves and only be re-scaffolding the recipe.
  if (!fs.existsSync(readmePath) || opts.force) {
    fs.writeFileSync(readmePath, buildTemplateReadme({ name: opts.name, fileName }), 'utf-8')
  }

  return { recipePath, readmePath }
}

export const initCommand = new Command('init')
  .description('Scaffold a new automation (.recipe.json)')
  .argument('<name>', 'Display name for the automation')
  .option('--description <text>', 'One-line description')
  .option('--category <category>', `One of: ${AUTOMATION_CATEGORIES.join(', ')}`, 'other')
  .option('--force', 'Overwrite an existing file')
  .action((name: string, options: { description?: string; category?: string; force?: boolean }) => {
    try {
      const { recipePath } = runInit({
        name,
        cwd: process.cwd(),
        description: options.description,
        category: options.category as AutomationCategory,
        force: options.force
      })
      ok(`Created ${filePath(path.basename(recipePath))}`)
      info('Next: edit the steps, then run `amc-automation validate`.')
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })
