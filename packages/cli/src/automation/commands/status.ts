import { Command } from 'commander'
import { resolveRecipePath, loadRecipe } from '../lib/recipe-file.js'
import { deriveAutomationId } from '../lib/envelope.js'
import { getMyAutomations, type AutomationSubmission } from '../api/automation-api.js'
import { getStoredTokenOrRefresh, type StoredToken } from '../../lib/auth.js'
import { MarketplaceApiError } from '../../lib/marketplace-api.js'
import { fail, info, label, heading, actionableError } from '../../lib/output.js'

export interface StatusOptions {
  cwd: string
  token?: StoredToken | null
  all?: boolean
}

const STATUS_TEXT: Record<string, string> = {
  pending: 'Pending review',
  approved: 'Published',
  rejected: 'Changes requested'
}

export async function runStatus(
  opts: StatusOptions
): Promise<{ exitCode: number; rows: AutomationSubmission[] }> {
  // Renews silently when the ID token has lapsed. Reading the file directly meant
  // `status` announced "Not signed in" the moment the hour-long token expired, while
  // the refresh token beside it was still good and the next publish would renew
  // without a browser. Never interactive: a failed renewal falls through to the same
  // sign-in advice below.
  const token = opts.token === undefined ? await getStoredTokenOrRefresh() : opts.token
  if (!token) {
    actionableError(
      'Not signed in to the AMC Marketplace',
      'Run `amc-automation publish` once to sign in with GitHub.'
    )
    return { exitCode: 1, rows: [] }
  }

  let all: AutomationSubmission[]
  try {
    all = await getMyAutomations(token)
  } catch (err) {
    // Distinguish "the server answered, and said no" from "we never reached it".
    // Collapsing both into a connection message sent authors to debug their network
    // over a rejection the server had already explained — and would have sent them
    // there permanently if the endpoint were ever missing or renamed.
    if (err instanceof MarketplaceApiError) {
      fail(err.message)
    } else {
      fail('Could not reach the marketplace. Check your connection and try again.')
    }
    return { exitCode: 1, rows: [] }
  }

  let rows = all
  if (!opts.all) {
    try {
      const recipe = loadRecipe(resolveRecipePath(opts.cwd)).recipe
      const id = deriveAutomationId(String(recipe.name ?? ''))
      rows = all.filter((r) => r.automationId === id)
    } catch {
      // No recipe here — fall back to showing everything rather than nothing.
      rows = all
    }
  }

  heading('Submissions')
  if (rows.length === 0) {
    info('Nothing submitted yet.')
    return { exitCode: 0, rows }
  }

  for (const row of rows) {
    label(`${row.automationId} v${row.version}`, STATUS_TEXT[row.status] ?? row.status)
    if (row.reviewNotes) console.log(`  ${row.reviewNotes}`)
  }
  return { exitCode: 0, rows }
}

export const statusCommand = new Command('status')
  .description('Check the review status of your submitted automations')
  .option('--all', 'Show every submission, not just this directory')
  .action(async (options: { all?: boolean }) => {
    const res = await runStatus({ cwd: process.cwd(), all: options.all })
    process.exit(res.exitCode)
  })
