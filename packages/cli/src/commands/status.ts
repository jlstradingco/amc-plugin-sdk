import { Command } from 'commander'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getStoredToken, authenticate } from '../lib/auth.js'
import { getMyPlugins } from '../lib/marketplace-api.js'
import { ok, fail, info, heading } from '../lib/output.js'

export const statusCommand = new Command('status')
  .description('Check submission status for the current plugin')
  .action(async () => {
    const cwd = process.cwd()
    const manifestPath = path.join(cwd, 'manifest.json')

    let pluginId: string | null = null
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        pluginId = manifest.plugin?.id ?? null
      } catch { /* ignore */ }
    }

    let token = getStoredToken()
    if (!token) {
      token = await authenticate()
    }

    const result = await getMyPlugins(token)

    const submissions = pluginId
      ? result.submissions.filter(s => s.pluginId === pluginId)
      : result.submissions

    if (submissions.length === 0) {
      info(pluginId
        ? `No submissions found for "${pluginId}"`
        : 'No submissions found')
      return
    }

    heading(`Submissions${pluginId ? ` for "${pluginId}"` : ''}`)
    for (const s of submissions) {
      if (s.status === 'approved') {
        ok(`${s.pluginId} v${s.version} — ${s.status} (${new Date(s.submittedAt).toLocaleDateString()})`)
      } else if (s.status === 'rejected') {
        fail(`${s.pluginId} v${s.version} — ${s.status} (${new Date(s.submittedAt).toLocaleDateString()})`)
      } else {
        info(`${s.pluginId} v${s.version} — ${s.status} (${new Date(s.submittedAt).toLocaleDateString()})`)
      }
      if (s.status === 'rejected' && s.reviewNotes) {
        console.log(`      Feedback: ${s.reviewNotes}`)
      }
    }
  })
