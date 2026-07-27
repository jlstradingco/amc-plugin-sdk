import { Command } from 'commander'
import { resolveRecipePath, loadRecipe, RecipeFileError } from '../lib/recipe-file.js'
import { runAllChecks } from '../checks/index.js'
import { hasErrors, reportFindings, findingsToJson, type Finding } from '../lib/findings.js'
import { buildEnvelope, deriveAutomationId } from '../lib/envelope.js'
import { validateAutomationRemote, type ServerValidation } from '../api/automation-api.js'
import { getStoredToken, type StoredToken } from '../../lib/auth.js'
import { ok, fail, warn, info, heading, actionableError } from '../../lib/output.js'

export interface ValidateOptions {
  cwd: string
  file?: string
  check?: boolean
  json?: boolean
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
    const token = opts.token ?? getStoredToken()
    if (!token) {
      if (!opts.json) {
        warn('Not signed in — skipping the server check.')
        info('Run `amc-automation publish` once to sign in, or drop --check.')
      }
    } else {
      // A dry-run envelope: the version and category do not matter to a
      // validity check, only the definition does.
      const envelope = buildEnvelope(recipe, {
        automationId: deriveAutomationId(String(recipe.name ?? '')),
        version: '0.0.0',
        category: 'other',
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
  .option('--json', 'Emit machine-readable findings')
  .action(async (file: string | undefined, options: { check?: boolean; json?: boolean }) => {
    const res = await runValidate({
      cwd: process.cwd(),
      file,
      check: options.check,
      json: options.json
    })
    process.exit(res.exitCode)
  })
