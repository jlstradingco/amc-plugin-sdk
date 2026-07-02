import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import chalk from 'chalk'
import { authenticate, getStoredToken } from '../lib/auth.js'
import { uploadPackage, getMyPlugins, MarketplaceApiError } from '../lib/marketplace-api.js'
import type { SecurityFinding, UploadResult } from '../lib/marketplace-api.js'
import { ok, fail, info, warn, heading } from '../lib/output.js'

export const publishCommand = new Command('publish')
  .description('Upload plugin to the AMC Marketplace for review')
  .option('--changelog <text>', 'Changelog for this version')
  .option('--watch', 'Poll until submission is approved or rejected')
  .action(async (opts: { changelog?: string; watch?: boolean }) => {
    const cwd = process.cwd()

    // 1. Check auth
    let token = getStoredToken()
    if (!token) {
      token = await authenticate()
    }

    // 2. Locate .amcplugin package
    let packagePath = findPackage(cwd)
    if (!packagePath) {
      info('No .amcplugin found. Running `amc-plugin package` first...')
      const { execSync } = await import('node:child_process')
      execSync('npx amc-plugin package', { cwd, stdio: 'inherit' })
      packagePath = findPackage(cwd)
    }

    if (!packagePath) {
      fail('Could not find or create .amcplugin package')
      process.exit(1)
    }

    const sizeMB = (fs.statSync(packagePath).size / 1024 / 1024).toFixed(2)
    info(`Uploading ${path.basename(packagePath)} (${sizeMB} MB)...`)

    // 3. Upload
    try {
      const result = await uploadPackage(token, packagePath, opts.changelog ?? '')
      ok(`Submitted for review (submission ID: ${result.submissionId})`)

      // Display security findings if present
      displaySecurityFindings(result)

      info('View your submission in Agent Mission Control → Marketplace → My Plugins tab.')
      if (!opts.watch) {
        info('Run `amc-plugin status` to check progress, or use --watch to wait.')
        return
      }

      // 4. Poll for status
      info('Watching for review decision...')
      for (let i = 0; i < 360; i++) { // 3 hours max
        await sleep(30_000) // 30 seconds

        try {
          const myPlugins = await getMyPlugins(token)
          const submission = myPlugins.submissions.find(s => s.id === result.submissionId)
          if (!submission) continue

          if (submission.status === 'approved') {
            ok('Plugin published!')
            return
          }
          if (submission.status === 'rejected') {
            fail(`Rejected: ${submission.reviewNotes ?? 'No feedback provided'}`)
            process.exit(1)
          }
        } catch {
          // Network error — keep polling
        }

        if (i % 2 === 0) process.stdout.write('.')
      }

      info('Timed out waiting for review. Check back with `amc-plugin status`.')
    } catch (err) {
      if (err instanceof MarketplaceApiError) {
        fail(`Upload failed: ${err.message}`)
        if (err.details.length > 0) {
          console.error('Validation issues:')
          for (const detail of err.details) {
            const d = detail as { id?: string; message?: string; passed?: boolean }
            if (d.id && !d.passed) {
              console.error(`  - [${d.id}] ${d.message ?? 'Failed'}`)
            }
          }
        }
        process.exit(1)
      }
      throw err
    }
  })

function findPackage(dir: string): string | null {
  // Look for .amcplugin in current dir
  const files = fs.readdirSync(dir)
  const amcFile = files.find(f => f.endsWith('.amcplugin'))
  if (amcFile) return path.join(dir, amcFile)

  // Check dist/
  const distDir = path.join(dir, 'dist')
  if (fs.existsSync(distDir)) {
    const distFiles = fs.readdirSync(distDir)
    const distAmcFile = distFiles.find(f => f.endsWith('.amcplugin'))
    if (distAmcFile) return path.join(distDir, distAmcFile)
  }

  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const SEVERITY_LABEL: Record<string, (s: string) => string> = {
  critical: (s) => chalk.red.bold(s),
  warning: (s) => chalk.yellow(s),
  info: (s) => chalk.blue(s)
}

function displaySecurityFindings(result: UploadResult): void {
  const report = result.securityReport
  if (!report || !report.findings || report.findings.length === 0) {
    ok('No security issues found')
    return
  }

  const { critical, warning: warnCount, info: infoCount } = report.severitySummary
  const parts: string[] = []
  if (critical > 0) parts.push(chalk.red.bold(`${critical} critical`))
  if (warnCount > 0) parts.push(chalk.yellow(`${warnCount} warning`))
  if (infoCount > 0) parts.push(chalk.blue(`${infoCount} info`))

  heading('Security Scan Results')
  console.log(`  Found ${parts.join(', ')} ${report.findings.length === 1 ? 'issue' : 'issues'}`)
  console.log()

  // Group by severity, show critical first
  const bySeverity: Record<string, SecurityFinding[]> = { critical: [], warning: [], info: [] }
  for (const f of report.findings) {
    ;(bySeverity[f.severity] ??= []).push(f)
  }

  for (const severity of ['critical', 'warning', 'info'] as const) {
    const findings = bySeverity[severity]
    if (!findings || findings.length === 0) continue

    const colorize = SEVERITY_LABEL[severity] ?? ((s: string) => s)
    console.log(colorize(`  ${severity.toUpperCase()} (${findings.length})`))
    for (const f of findings) {
      console.log(chalk.dim(`    ${f.file}:${f.line}`) + ` — ${f.ruleId}`)
      if (f.snippet) {
        console.log(chalk.dim(`      ${f.snippet.slice(0, 80)}`))
      }
    }
    console.log()
  }

  if (result.message) {
    if (critical > 0 || warnCount > 0) {
      warn(result.message)
    } else {
      info(result.message)
    }
  }
}
