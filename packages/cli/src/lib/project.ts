import * as fs from 'node:fs'
import * as path from 'node:path'
import { isBannedScanTarget } from './banned-imports.js'

export function isTypeScriptProject(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, 'tsconfig.json'))
}

interface FlatManifestLike {
  ui?: { entryPoint?: string; widget?: { entryPoint?: string } }
  backend?: { entryPoint?: string }
}

const CONVENTIONAL_DIRS = ['assets', 'prompts']

const README_RE = /^readme\.md$/i

export function findRootReadme(cwd: string): string | null {
  for (const entry of fs.readdirSync(cwd, { withFileTypes: true })) {
    if (entry.isFile() && README_RE.test(entry.name)) return entry.name
  }
  return null
}

export function collectFlatPackageEntries(cwd: string, manifest: FlatManifestLike): string[] {
  const names = new Set<string>()

  const addTopSegment = (entryPoint?: string) => {
    if (!entryPoint) return
    const segment = entryPoint.split(/[/\\]/)[0]
    if (segment && segment !== 'manifest.json') names.add(segment)
  }

  addTopSegment(manifest.ui?.entryPoint)
  addTopSegment(manifest.ui?.widget?.entryPoint)
  addTopSegment(manifest.backend?.entryPoint)
  for (const dir of CONVENTIONAL_DIRS) names.add(dir)

  return [...names].filter((name) => fs.existsSync(path.join(cwd, name)))
}

export function collectPackageEntries(cwd: string, manifest: FlatManifestLike): string[] {
  const typeScript = isTypeScriptProject(cwd)
  const entries = typeScript ? ['dist'] : collectFlatPackageEntries(cwd, manifest)
  if (typeScript && fs.existsSync(path.join(cwd, 'assets'))) entries.push('assets')
  const readme = findRootReadme(cwd)
  if (readme) entries.push(readme)
  return entries
}

export function entryPointShips(
  cwd: string,
  manifest: FlatManifestLike,
  entryPoint: string
): { ships: boolean; entries: string[] } {
  const entries = collectPackageEntries(cwd, manifest)
  const top = entryPoint.split(/[/\\]/)[0] ?? ''
  return { ships: entries.includes(top), entries }
}

export type EntryPointState = 'built' | 'unbuilt' | 'stale' | 'missing'

export function entryPointState(
  cwd: string,
  entryPoint: string,
  compiledFromTs = false
): { state: EntryPointState; source: string; buildDir: string } {
  const segments = entryPoint.split(/[/\\]/).filter(s => s !== '' && s !== '.')
  const buildDir = segments[0] ?? ''
  const sourceSegments = buildDir === 'dist' ? segments.slice(1) : segments
  const mapped = ['src', ...sourceSegments].join('/')
  const source = compiledFromTs ? mapped.replace(/\.js$/, '.ts') : mapped
  const exists = (rel: string) => fs.existsSync(path.join(cwd, rel))
  if (exists(entryPoint)) return { state: 'built', source, buildDir }
  if (!exists(source)) return { state: 'missing', source, buildDir }
  return { state: exists(buildDir) ? 'stale' : 'unbuilt', source, buildDir }
}

export function resolveBannedScanDirs(cwd: string, manifest: FlatManifestLike): string[] {
  if (!isTypeScriptProject(cwd)) {
    return collectFlatPackageEntries(cwd, manifest)
      .map((entry) => path.join(cwd, entry))
      .filter(isBannedScanTarget)
  }
  return [path.join(cwd, 'dist')].filter((dir) => fs.existsSync(dir))
}

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
