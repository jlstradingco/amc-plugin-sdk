import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { buildSync } from 'esbuild'
import { actionableError } from './output.js'
import { copyNonTsFiles } from './project.js'
import { classicParseError, listHtmlFiles, resolvePageScripts } from './page-scripts.js'

const UI_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs']
const UI_BUNDLE_TARGET = 'es2022'

export interface UiBundle {
  entry: string
  outfile: string
}

export type CompileRunner = (cwd: string) => void

const runTsc: CompileRunner = (cwd) => {
  execSync('npx tsc', { cwd, stdio: 'inherit' })
}

function uiSourceFor(srcUi: string, distUi: string, script: string): string | null {
  const stem = path.join(srcUi, path.relative(distUi, script)).replace(/\.m?js$/, '')
  const candidates = UI_SOURCE_EXTENSIONS.map((ext) => stem + ext)
  return candidates.find((file) => fs.existsSync(file)) ?? null
}

function needsBundling(script: string): boolean {
  return !fs.existsSync(script) || classicParseError(fs.readFileSync(script, 'utf-8'), script) !== null
}

export function planUiBundles(cwd: string): UiBundle[] {
  const srcUi = path.join(cwd, 'src', 'ui')
  const distUi = path.join(cwd, 'dist', 'ui')
  const scripts = new Set(listHtmlFiles(distUi).flatMap((page) => resolvePageScripts(distUi, page)))
  return [...scripts].filter(needsBundling).flatMap((outfile) => {
    const entry = uiSourceFor(srcUi, distUi, outfile)
    return entry ? [{ entry, outfile }] : []
  })
}

export function bundleUiScripts(cwd: string): UiBundle[] {
  const bundles = planUiBundles(cwd)
  for (const { entry, outfile } of bundles) {
    buildSync({
      absWorkingDir: cwd,
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: UI_BUNDLE_TARGET,
      allowOverwrite: true,
      logLevel: 'error'
    })
  }
  return bundles
}

export function compilePlugin(cwd: string, run: CompileRunner = runTsc): UiBundle[] {
  run(cwd)
  const srcUi = path.join(cwd, 'src', 'ui')
  if (fs.existsSync(srcUi)) copyNonTsFiles(srcUi, path.join(cwd, 'dist', 'ui'))
  return bundleUiScripts(cwd)
}

export function compilePluginOrExit(cwd: string): UiBundle[] {
  try {
    return compilePlugin(cwd)
  } catch {
    actionableError('Build failed', 'Check the errors above and fix your source files.')
    process.exit(1)
  }
}
