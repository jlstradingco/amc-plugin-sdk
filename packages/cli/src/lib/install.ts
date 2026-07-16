import * as fs from 'node:fs'
import * as path from 'node:path'
import { collectPackageEntries } from './project.js'

interface ManifestLike {
  ui?: { entryPoint?: string }
  backend?: { entryPoint?: string }
}

/**
 * Copy a built plugin's payload (manifest.json + its package entries) into an
 * AMC plugins directory (`<userData>/plugins/<id>`), overwriting prior code.
 *
 * A re-copied entry directory is cleared first so a file the developer deleted
 * in source doesn't linger in the installed copy. The plugin's runtime `data/`
 * dir — where AMC persists the plugin's ctx.fs state — is NOT part of the
 * package payload, so it is left untouched and survives every re-install.
 *
 * Returns the top-level entry names that were copied.
 */
export function copyPluginToDir(cwd: string, manifest: ManifestLike, destDir: string): string[] {
  fs.mkdirSync(destDir, { recursive: true })

  // manifest.json always lives at the root.
  fs.copyFileSync(path.join(cwd, 'manifest.json'), path.join(destDir, 'manifest.json'))

  const entries = collectPackageEntries(cwd, manifest)
  for (const entry of entries) {
    const src = path.join(cwd, entry)
    if (!fs.existsSync(src)) continue
    const dest = path.join(destDir, entry)
    if (fs.statSync(src).isDirectory()) {
      // Clear the destination dir so stale (since-deleted) files don't linger.
      fs.rmSync(dest, { recursive: true, force: true })
      fs.cpSync(src, dest, { recursive: true })
    } else {
      fs.copyFileSync(src, dest)
    }
  }

  return entries
}
