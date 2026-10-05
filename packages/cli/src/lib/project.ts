import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * A flat-JS / webview plugin has no TypeScript compile step — its files ship
 * as-authored at the archive root. We key off the presence of tsconfig.json,
 * which is the definitive signal for "should `tsc` run here". Running tsc in a
 * flat plugin hangs (nothing to compile / interactive install prompt).
 */
export function isTypeScriptProject(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, 'tsconfig.json'))
}

interface FlatManifestLike {
  ui?: { entryPoint?: string }
  backend?: { entryPoint?: string }
}

const CONVENTIONAL_DIRS = ['assets', 'prompts']

const README_RE = /^readme\.md$/i

/**
 * The marketplace renders the package's README on the plugin's detail page and
 * finds it with the same case-insensitive match, so the file ships under its
 * real on-disk name.
 */
export function findRootReadme(cwd: string): string | null {
  for (const entry of fs.readdirSync(cwd, { withFileTypes: true })) {
    if (entry.isFile() && README_RE.test(entry.name)) return entry.name
  }
  return null
}

/**
 * Top-level entries a flat plugin's `.amcplugin` should contain (besides
 * manifest.json, which the packager adds at the root itself). Derived from the
 * manifest's entry points plus conventional `assets/`/`prompts/` dirs, filtered
 * to what actually exists on disk. Entries may be directories or single files.
 */
export function collectFlatPackageEntries(cwd: string, manifest: FlatManifestLike): string[] {
  const names = new Set<string>()

  const addTopSegment = (entryPoint?: string) => {
    if (!entryPoint) return
    const segment = entryPoint.split(/[/\\]/)[0]
    if (segment && segment !== 'manifest.json') names.add(segment)
  }

  addTopSegment(manifest.ui?.entryPoint)
  addTopSegment(manifest.backend?.entryPoint)
  for (const dir of CONVENTIONAL_DIRS) names.add(dir)

  const entries = [...names].filter((name) => fs.existsSync(path.join(cwd, name)))
  const readme = findRootReadme(cwd)
  if (readme) entries.push(readme)
  return entries
}

/**
 * The top-level entries (besides manifest.json) that make up a plugin's
 * shippable payload — the single source of truth shared by `package` and
 * `install` so both agree on exactly what a plugin consists of. A TypeScript
 * plugin ships its compiled `dist/` tree (plus an optional top-level `assets/`);
 * a flat-JS plugin ships its as-authored folders. A root README.md ships in
 * both cases (when present) so the marketplace listing can render it.
 */
export function collectPackageEntries(cwd: string, manifest: FlatManifestLike): string[] {
  if (!isTypeScriptProject(cwd)) return collectFlatPackageEntries(cwd, manifest)
  const entries = ['dist']
  if (fs.existsSync(path.join(cwd, 'assets'))) entries.push('assets')
  const readme = findRootReadme(cwd)
  if (readme) entries.push(readme)
  return entries
}

/** Recursively copy every non-`.ts` file from `src` into `dest`. */
export function copyNonTsFiles(src: string, dest: string): void {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyNonTsFiles(srcPath, destPath)
    } else if (!entry.name.endsWith('.ts')) {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
