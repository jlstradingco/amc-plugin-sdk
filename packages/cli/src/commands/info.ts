import { Command } from 'commander'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { validateManifest } from '@agent-mc/plugin-sdk'
import { ok, fail, label, heading, manifestNotFound } from '../lib/output.js'
import { getStoredToken } from '../lib/auth.js'
import { getMyPlugins } from '../lib/marketplace-api.js'

export const infoCommand = new Command('info')
  .description('Show a formatted summary of the current plugin project')
  .option('--json', 'Output as JSON')
  .action(async (opts: { json?: boolean }) => {
    const cwd = process.cwd()
    const manifestPath = path.join(cwd, 'manifest.json')

    if (!fs.existsSync(manifestPath)) {
      manifestNotFound()
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

    if (opts.json) {
      const result = validateManifest(manifest)
      console.log(JSON.stringify({ manifest, validation: result }, null, 2))
      return
    }

    const p = manifest.plugin ?? {}
    heading('Plugin Info')
    label('Plugin:', `${p.name ?? 'Unknown'} (${p.id ?? 'no-id'})`)
    label('Version:', p.version ?? '0.0.0')
    label('Author:', p.author ?? 'Unknown')
    label('Category:', p.category ?? 'other')
    // Discoverability tags folded into marketplace search + rendered as card chips.
    // Array-guarded — an older/hand-written manifest may omit the field.
    label('Tags:', Array.isArray(p.tags) && p.tags.length > 0 ? p.tags.join(', ') : 'none')
    label('License:', p.license?.type ?? 'free')
    if (manifest.sdkVersion) label('SDK Version:', manifest.sdkVersion)

    console.log('')

    // Permissions
    const perms = manifest.permissions ?? []
    label('Permissions:', perms.length > 0 ? perms.join(', ') : 'none')

    // Collections
    const collections = manifest.storage?.collections ?? {}
    const collNames = Object.keys(collections)
    if (collNames.length > 0) {
      for (const name of collNames) {
        const coll = collections[name]
        const colCount = Object.keys(coll.columns ?? {}).length
        const idxCount = (coll.indexes ?? []).length
        label('Collection:', `${name} (${colCount} columns, ${idxCount} indexes)`)
      }
    } else {
      label('Collections:', 'none')
    }

    // Backend
    label('Backend:', manifest.backend?.entryPoint ?? 'none')

    // Cron
    const cronJobs = manifest.cron?.jobs ?? []
    if (cronJobs.length > 0) {
      for (const job of cronJobs) {
        label('Cron Job:', `${job.id} (${job.schedule})`)
      }
    } else {
      label('Cron Jobs:', 'none')
    }

    // CLI endpoints
    const endpoints = manifest.cli?.endpoints ?? []
    label('CLI Endpoints:', endpoints.length > 0 ? `${endpoints.length} defined` : 'none')

    // Settings
    const settings = manifest.settings ?? []
    label('Settings:', settings.length > 0 ? `${settings.length} defined` : 'none')

    console.log('')

    // Validation
    const result = validateManifest(manifest)
    if (result.valid) {
      ok('Manifest valid')
    } else {
      fail('Manifest invalid')
      result.errors.forEach((e) => console.error(`  - ${e}`))
    }

    // Marketplace status (if authenticated)
    const token = getStoredToken()
    if (token && p.id) {
      try {
        const myPlugins = await getMyPlugins(token)
        const submissions = myPlugins.submissions.filter((s) => s.pluginId === p.id)
        if (submissions.length > 0) {
          const latest = submissions[0]
          label(
            '\nMarketplace:',
            `${latest.status} (v${latest.version}, ${new Date(latest.submittedAt).toLocaleDateString()})`
          )
        } else {
          label('\nMarketplace:', 'not published')
        }
      } catch {
        label('\nMarketplace:', 'could not check (network error)')
      }
    } else {
      label('\nMarketplace:', token ? 'not published' : 'not authenticated')
    }
  })
