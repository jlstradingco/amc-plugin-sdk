// The command-table ship check as the CLI shows it.
//
// The blocking part is the SDK's checkCommandTables: one pure function over the manifest, so
// `validate`, `preflight` and `publish` give the same answer (and the marketplace can reuse it).
// `validate` adds one author-time hint the manifest cannot carry: shipped code that asks a table
// for its pending rows. That hint is a warning only — it reads code, so it can be wrong.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { checkCommandTables } from '@agent-mc/plugin-sdk'
import { scannableFiles } from './banned-imports.js'
import type { PreflightResult } from './publish-preflight.js'
import { fail, info, ok, warn } from './output.js'

const CHECK_NAME = 'Command tables'

const BLOCK_SUGGESTION =
  'Send commands through the panel command channel (createCommandChannel in @agent-mc/plugin-sdk/commands), ' +
  'or add "commandTableWaiver": "<why this table is safe>" to the table. See the Panel commands guide.'

const WARN_SUGGESTION = 'Make sure no table row can make your plugin act; see the Panel commands guide.'

/**
 * A db query that filters on a pending/queued status: how a backend drains a command table. The key
 * is `status` or `state`, alone or ending a longer name (`summary_status`, `jobState`); the value
 * must be waiting work, so other status filters stay quiet.
 */
const PENDING_POLL =
  /\.query(?:All)?\s*\([^)]{0,200}?\b(?:(?:\w*_)?(?:status|state)|[a-z]\w*(?:Status|State))\s*:\s*['"](?:pending|queued)['"]/g

export function commandTablesPreflight(manifest: unknown): PreflightResult {
  const report = checkCommandTables(manifest)
  const tables = (findings: Array<{ table: string; columns: string[] }>) =>
    findings.map((f) => `"${f.table}" (${f.columns.join(' + ')})`).join(', ')
  if (report.blocking.length > 0) {
    return {
      name: CHECK_NAME,
      status: 'fail',
      message: `${tables(report.blocking)} can hold a runnable command an agent could write or re-arm`,
      suggestion: BLOCK_SUGGESTION,
    }
  }
  if (report.warnings.length > 0) {
    return { name: CHECK_NAME, status: 'warn', message: report.warnings.map((f) => f.message).join(' '), suggestion: WARN_SUGGESTION }
  }
  const waived = report.waived.length > 0 ? ` (waived: ${report.waived.map((w) => w.table).join(', ')})` : ''
  return { name: CHECK_NAME, status: 'pass', message: `No table can hold a runnable command${waived}` }
}

/** Prints the check for `validate`. Returns true when it must fail the run. */
export function reportCommandTables(manifest: unknown, scanPaths: string[], cwd: string): boolean {
  const report = checkCommandTables(manifest)
  for (const finding of report.blocking) fail(finding.message)
  for (const finding of report.warnings) warn(finding.message)
  for (const waived of report.waived) info(`Table "${waived.table}" ships on its written waiver: "${waived.waiver}"`)
  for (const hit of scanPendingPolls(scanPaths)) {
    warn(`${path.relative(cwd, hit)} asks a table for its pending rows. Make sure a row can never make your plugin act.`)
  }
  if (report.blocking.length + report.warnings.length + report.waived.length === 0) ok(CHECK_NAME)
  return report.blocking.length > 0
}

/** 1-based line numbers of every pending-row query in a piece of JS. Pure, for testing. */
export function findPendingPolls(content: string): number[] {
  return [...content.matchAll(PENDING_POLL)].map((match) => content.slice(0, match.index).split('\n').length)
}

/** `<file>:<line>` for every pending-row query in the given files and folders. */
export function scanPendingPolls(paths: string[]): string[] {
  return paths.flatMap((entry) => scannableFiles(entry)).flatMap((file) =>
    findPendingPolls(fs.readFileSync(file, 'utf-8')).map((line) => `${file}:${line}`)
  )
}
