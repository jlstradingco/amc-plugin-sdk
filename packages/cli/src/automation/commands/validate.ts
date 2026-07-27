import { Command } from 'commander'
import { resolveRecipePath, loadRecipe, RecipeFileError } from '../lib/recipe-file.js'
import { runAllChecks } from '../checks/index.js'
import { hasErrors, reportFindings, findingsToJson, type Finding } from '../lib/findings.js'
import {
  buildEnvelope,
  deriveAutomationId,
  AUTOMATION_CATEGORIES,
  DEFAULT_PUBLISH_VERSION,
  DEFAULT_PUBLISH_CATEGORY,
  type AutomationCategory
} from '../lib/envelope.js'
import { validateAutomationRemote, type ServerValidation } from '../api/automation-api.js'
import { getStoredTokenOrRefresh, type StoredToken } from '../../lib/auth.js'
import { ok, fail, warn, info, heading, actionableError } from '../../lib/output.js'

export interface ValidateOptions {
  cwd: string
  file?: string
  check?: boolean
  json?: boolean
  /** The version to validate AS. Defaults to publish's own default so the two agree. */
  version?: string
  /** The category to validate AS. Defaults to publish's own default so the two agree. */
  category?: AutomationCategory
  token?: StoredToken | null
}

export interface ValidateResult {
  exitCode: number
  findings: Finding[]
  server: ServerValidation | null
}

export async function runValidate(opts: ValidateOptions): Promise<ValidateResult> {
  let recipe: Record<string, unknown>
  try {
    const resolved = resolveRecipePath(opts.cwd, opts.file)
    recipe = loadRecipe(resolved).recipe
  } catch (err) {
    if (err instanceof RecipeFileError) {
      if (!opts.json) actionableError(err.message, err.suggestion)
      return { exitCode: 1, findings: [], server: null }
    }
    throw err
  }

  const findings = runAllChecks(recipe)
  let server: ServerValidation | null = null

  if (opts.check) {
    // Renews silently rather than declaring the author signed out the moment the
    // hour-long ID token lapsed. Never interactive — `validate` must not turn into a
    // browser sign-in; a failed renewal just skips the server check.
    const token = opts.token ?? (await getStoredTokenOrRefresh())
    if (!token) {
      if (!opts.json) {
        warn('Not signed in — skipping the server check.')
        info('Run `amc-automation publish` once to sign in, or drop --check.')
      }
    } else {
      // Built with the SAME version and category `publish` would send, not with
      // placeholders. The server's verdict now covers the two stateful rejections a
      // publish can still hit after the shape checks pass — the namespace being owned
      // by another developer, and this version already existing — and a placeholder
      // version would have made the second answer meaningless.
      const envelope = buildEnvelope(recipe, {
        automationId: deriveAutomationId(String(recipe.name ?? '')),
        version: opts.version ?? DEFAULT_PUBLISH_VERSION,
        category: opts.category ?? DEFAULT_PUBLISH_CATEGORY,
        changelog: ''
      })
      server = await validateAutomationRemote(token, envelope)
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ ...findingsToJson(findings), server }, null, 2))
  } else {
    heading('Local checks')
    reportFindings(findings)
    if (opts.check) {
      heading('Marketplace check')
      if (!server) {
        // A missing optional endpoint is not the author's problem (spec §7).
        info('Server validation unavailable — local checks only.')
      } else if (server.valid) {
        ok('The marketplace accepts this automation.')
      } else {
        for (const e of server.errors) fail(e)
      }
    }
  }

  const failed = hasErrors(findings) || server?.valid === false
  return { exitCode: failed ? 1 : 0, findings, server }
}

export const validateCommand = new Command('validate')
  .description('Check an automation before publishing')
  .argument('[file]', 'Path to the .recipe.json (defaults to the one in this directory)')
  .option('--check', 'Also ask the marketplace for the authoritative verdict')
  .option(
    '--version <version>',
    'Version to validate as, so --check can answer about version collisions',
    DEFAULT_PUBLISH_VERSION
  )
  .option('--category <category>', `One of: ${AUTOMATION_CATEGORIES.join(', ')}`, DEFAULT_PUBLISH_CATEGORY)
  .option('--json', 'Emit machine-readable findings')
  .action(
    async (
      file: string | undefined,
      options: { check?: boolean; json?: boolean; version?: string; category?: string }
    ) => {
      const res = await runValidate({
        cwd: process.cwd(),
        file,
        check: options.check,
        json: options.json,
        version: options.version,
        category: options.category as AutomationCategory
      })
      process.exit(res.exitCode)
    }
  )
