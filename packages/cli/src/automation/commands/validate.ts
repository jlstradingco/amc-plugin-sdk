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
import { checkPublishInputs, inputProblemsAsFindings } from '../lib/publish-inputs.js'
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

  // Flag problems join the recipe's own findings rather than aborting: `validate` is
  // asking "what is wrong with this publish?", and a bad --version is one answer among
  // several, not a reason to stop looking for the others.
  const inputProblems = checkPublishInputs({ version: opts.version, category: opts.category })
  const findings = [...inputProblemsAsFindings(inputProblems), ...runAllChecks(recipe)]
  let server: ServerValidation | null = null

  // A malformed version or category cannot be asked ABOUT — the envelope would be
  // rejected on shape before the server reached the collision and ownership checks
  // that are the only reason to make the call.
  if (opts.check && inputProblems.length > 0) {
    if (!opts.json) {
      heading('Local checks')
      reportFindings(findings)
      heading('Marketplace check')
      warn('Skipped — fix the version and category first.')
    } else {
      console.log(JSON.stringify({ ...findingsToJson(findings), server: null }, null, 2))
    }
    return { exitCode: 1, findings, server: null }
  }

  if (opts.check) {
    // Renews silently rather than declaring the author signed out the moment the
    // hour-long ID token lapsed. Never interactive — `validate` must not turn into a
    // browser sign-in; a failed renewal just skips the server check.
    // `=== undefined`, not `??`: the option is typed `StoredToken | null`, so an
    // explicit null MEANS "signed out" and must be honoured. Under `??` a caller
    // passing null fell through to the real disk-and-network lookup instead — the
    // same seam `status` already gets right.
    const token = opts.token === undefined ? await getStoredTokenOrRefresh() : opts.token
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
