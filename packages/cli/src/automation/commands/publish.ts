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
import { checkPublishInputs } from '../lib/publish-inputs.js'
import { uploadAutomation } from '../api/automation-api.js'
import { authenticate, getStoredToken, clearToken, type StoredToken } from '../../lib/auth.js'
import { MarketplaceApiError } from '../../lib/marketplace-api.js'
import { evaluatePublishAccount, SWITCH_ACCOUNT_GUIDANCE } from '../../lib/publish-account.js'
import { ok, fail, info, label, heading, actionableError } from '../../lib/output.js'

/** The interactive identity confirmation, isolated so tests can drive it without a TTY. */
export type ConfirmIdentity = (github: string) => Promise<boolean>

/**
 * Ask, out loud, whether this is the right account to publish under.
 *
 * Loaded lazily so `runPublish` stays importable (and testable) without pulling in
 * a TTY-dependent prompt library, and so `--yes` runs never construct one at all.
 */
const promptForIdentity: ConfirmIdentity = async (github) => {
  const { default: prompts } = await import('prompts')
  const { default: chalk } = await import('chalk')
  label('\nPublishing as:', chalk.bold(github))
  const { confirmed } = await prompts({
    type: 'confirm',
    name: 'confirmed',
    message: `Publish this automation to the marketplace as "${github}"?`,
    initial: false
  })
  return confirmed === true
}

export interface PublishOptions {
  cwd: string
  file?: string
  token?: StoredToken
  version?: string
  category?: AutomationCategory
  changelog?: string
  as?: string
  yes?: boolean
  switchAccount?: boolean
  dryRun?: boolean
  skipValidation?: boolean
  /** Overrides the interactive confirmation. Tests inject; the CLI never passes it. */
  confirmIdentity?: ConfirmIdentity
}

export async function runPublish(
  opts: PublishOptions
): Promise<{ exitCode: number; submissionId?: string }> {
  // Before anything reads the disk or the network: a typo in a flag is the cheapest
  // possible failure, and the most expensive one to discover from a 400 after the
  // upload slot is already spent.
  const inputProblems = checkPublishInputs({ version: opts.version, category: opts.category })
  if (inputProblems.length > 0) {
    for (const problem of inputProblems) actionableError(problem.message, problem.suggestion)
    return { exitCode: 1 }
  }

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

  // --switch-account forces a fresh sign-in before anything else reads the token.
  if (opts.switchAccount && !opts.token) {
    const prev = getStoredToken()
    clearToken()
    if (prev) info(`Signed out (was: ${prev.github})`)
    heading('Switching GitHub account')
    console.log(SWITCH_ACCOUNT_GUIDANCE)
    console.log('')
  }

  const token = opts.token ?? (await authenticate())

  // The silent-account trap: GitHub OAuth reuses whatever account the default browser
  // is already signed into, so a publish can go out under an identity the author never
  // chose — and a published automation carries that name permanently. The plugin
  // surface has confirmed this since it shipped; the automation surface declared a
  // --yes flag to SKIP the confirmation without ever having one, so every publish went
  // out unconfirmed. Same shared gate, so the two binaries cannot drift apart again.
  const gate = evaluatePublishAccount(token.github, {
    as: opts.as,
    yes: opts.yes,
    commandName: 'amc-automation publish'
  })
  if (gate.action === 'abort') {
    actionableError(gate.message, gate.suggestion)
    return { exitCode: 1 }
  }
  if (gate.action === 'confirm') {
    const confirmed = await (opts.confirmIdentity ?? promptForIdentity)(gate.github)
    if (!confirmed) {
      info('Cancelled — nothing was published.')
      info("Wrong account? Run 'amc-automation publish --switch-account'.")
      return { exitCode: 1 }
    }
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

/**
 * Build a FRESH `publish` command.
 *
 * A factory, not a module-level singleton. Commander stores parsed option values ON the
 * Command object, so a shared instance carries `--version 1.0.0` from one parse into the
 * next — which made `buildAutomationProgram` return programs that silently shared mutable
 * state and defaulted differently depending on what had already run.
 */
export function createPublishCommand(): Command {
  return new Command('publish')
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
    .option('--switch-account', 'Sign out first and re-authenticate as a different account')
    .option('-y, --yes', 'Skip the upload-identity confirmation prompt (for CI)')
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
        switchAccount: options.switchAccount as boolean,
        yes: options.yes as boolean,
        dryRun: options.dryRun as boolean,
        skipValidation: options.skipValidation as boolean
      })
      process.exit(res.exitCode)
    })
}
