import { Command } from 'commander'
import { execSync } from 'node:child_process'
import { ok, info, fail, label, actionableError } from '../lib/output.js'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export const updateCommand = new Command('update')
  .description('Update the amc-plugin CLI to the latest version')
  .option('--check', 'Check for updates without installing')
  .action(async (opts: { check?: boolean }) => {
    // Read current version
    let currentVersion: string
    try {
      const pkg = require('../../package.json')
      currentVersion = pkg.version
    } catch {
      currentVersion = 'unknown'
    }

    label('Current version:', currentVersion)

    // Fetch latest from npm
    info('Checking npm registry...')
    let latestVersion: string
    try {
      const res = await globalThis.fetch('https://registry.npmjs.org/@amc/plugin-cli/latest')
      if (!res.ok) {
        // Package not published yet — expected for private repo
        info('Package not found on npm (private repo — install via git)')
        return
      }
      const data = (await res.json()) as { version?: string }
      latestVersion = data.version ?? 'unknown'
    } catch {
      fail('Could not reach npm registry')
      return
    }

    label('Latest version:', latestVersion)

    if (currentVersion === latestVersion) {
      ok('Already up to date')
      return
    }

    if (opts.check) {
      info(`Update available: ${currentVersion} → ${latestVersion}`)
      return
    }

    info(`Updating ${currentVersion} → ${latestVersion}...`)
    try {
      execSync('npm install -g @amc/plugin-cli@latest', { stdio: 'inherit' })
      ok(`Updated to ${latestVersion}`)
    } catch {
      actionableError(
        'Update failed',
        "Try running with sudo: 'sudo npm install -g @amc/plugin-cli@latest'"
      )
      process.exit(1)
    }
  })
