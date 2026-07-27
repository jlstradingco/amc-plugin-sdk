import { Command } from 'commander'
import { resolveRecipePath, loadRecipe, RecipeFileError } from '../lib/recipe-file.js'
import { runAllChecks } from '../checks/index.js'
import { hasErrors, reportFindings } from '../lib/findings.js'
import {
  buildEnvelope,
  deriveAutomationId,
  AUTOMATION_CATEGORIES,
  DEFAULT_PUBLISH_VERSION,
  DEFAULT_PUBLISH_CATEGORY,
  type AutomationCategory
} from '../lib/envelope.js'
import { uploadAutomation } from '../api/automation-api.js'
import { authenticate, type StoredToken } from '../../lib/auth.js'
import { MarketplaceApiError } from '../../lib/marketplace-api.js'
import { ok, fail, info, heading, actionableError } from '../../lib/output.js'

export interface PublishOptions {
  cwd: string
  file?: string
  token?: StoredToken
  version?: string
  category?: AutomationCategory
  changelog?: string
  as?: string
  yes?: boolean
  dryRun?: boolean
  skipValidation?: boolean
}

export async function runPublish(
  opts: PublishOptions
): Promise<{ exitCode: number; submissionId?: string }> {
  let recipe: Record<string, unknown>
  try {
    const resolved = resolveRecipePath(opts.cwd, opts.file)
    recipe = loadRecipe(resolved).recipe
  } catch (err) {
    if (err instanceof RecipeFileError) {
      actionableError(err.message, err.suggestion)
      return { exitCode: 1 }
    }
    throw err
  }

  if (!opts.skipValidation) {
    const findings = runAllChecks(recipe)
    if (findings.length > 0) {
      heading('Local checks')
      reportFindings(findings)
    }
    if (hasErrors(findings)) {
      actionableError(
        'This automation has problems that would block it from running.',
        'Fix them, or pass --skip-validation to publish anyway.'
      )
      return { exitCode: 1 }
    }
  }

  const token = opts.token ?? (await authenticate())

  if (opts.as && opts.as !== token.github) {
    actionableError(
      `Signed in as ${token.github}, not ${opts.as}.`,
      'Sign out with `amc-plugin logout` and publish again, or drop --as.'
    )
    return { exitCode: 1 }
  }

  const envelope = buildEnvelope(recipe, {
    automationId: deriveAutomationId(String(recipe.name ?? '')),
    version: opts.version ?? DEFAULT_PUBLISH_VERSION,
    category: opts.category ?? DEFAULT_PUBLISH_CATEGORY,
    changelog: opts.changelog ?? ''
  })

  if (opts.dryRun) {
    ok(`Dry run — would publish "${envelope.automationId}" v${envelope.version} as ${token.github}`)
    return { exitCode: 0 }
  }

  info(`Publishing ${envelope.automationId} v${envelope.version} as ${token.github}...`)

  try {
    const res = await uploadAutomation(token, envelope)
    ok(`Submitted for review (submission ${res.submissionId})`)
    info('Run `amc-automation status` to follow the review.')
    return { exitCode: 0, submissionId: res.submissionId }
  } catch (err) {
    if (err instanceof MarketplaceApiError) {
      // The server's own reasons are the authoritative ones — show them verbatim.
      fail(err.message)
      return { exitCode: 1 }
    }
    fail('Could not reach the marketplace. Check your connection and try again.')
    return { exitCode: 1 }
  }
}

export const publishCommand = new Command('publish')
  .description('Publish an automation to the AMC Marketplace for review')
  .argument('[file]', 'Path to the .recipe.json')
  .option('--version <version>', 'Version for this submission', DEFAULT_PUBLISH_VERSION)
  .option(
    '--category <category>',
    `One of: ${AUTOMATION_CATEGORIES.join(', ')}`,
    DEFAULT_PUBLISH_CATEGORY
  )
  .option('--changelog <text>', 'What changed in this version')
  .option('--as <github-user>', 'Assert the expected GitHub account; aborts on mismatch')
  .option('-y, --yes', 'Skip the identity confirmation prompt')
  .option('--dry-run', 'Do everything except the upload')
  .option('--skip-validation', 'Publish even if local checks report errors')
  .action(async (file: string | undefined, options: Record<string, unknown>) => {
    const res = await runPublish({
      cwd: process.cwd(),
      file,
      version: options.version as string,
      category: options.category as AutomationCategory,
      changelog: options.changelog as string,
      as: options.as as string,
      yes: options.yes as boolean,
      dryRun: options.dryRun as boolean,
      skipValidation: options.skipValidation as boolean
    })
    process.exit(res.exitCode)
  })
