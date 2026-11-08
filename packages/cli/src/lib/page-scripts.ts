import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vm from 'node:vm'
import type { PreflightResult } from './publish-preflight.js'
import { collectPackageEntries, isTypeScriptProject } from './project.js'
import { readPackageFiles } from './package-selection.js'

const SCRIPT_TAG_RE = /<script\b([^>]*)>/gi
const MODULE_TYPE_RE = /(?:^|\s)type\s*=\s*["']?module["'\s>]/i
const SRC_ATTR_RE = /(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const NON_RELATIVE_SRC_RE = /^(?:[a-z][a-z0-9+.-]*:|\/)/i
const MAX_NAMED_PROBLEMS = 3
const SKIPPED_DIRS = new Set(['node_modules'])

const TYPESCRIPT_REMEDY =
  "The panel would open blank in Omniscio. Run 'amc-plugin build' (it bundles each page's script so it loads as the page declares it), then 'amc-plugin package' to rebuild the .amcplugin."
const FLAT_REMEDY =
  'The panel would open blank in Omniscio. A plain-JS plugin ships its scripts as written: remove import/export from the script, or load it with <script type="module">, and make sure every script a page names is packaged.'

export interface PackageFiles {
  names: string[]
  read(name: string): string | null
}

export interface PageScriptProblem {
  page: string
  script: string
  reason: 'missing' | 'not-a-classic-script'
  detail?: string
}

export function classicScriptSrcs(html: string): string[] {
  const srcs: string[] = []
  for (const [, attrs] of html.matchAll(SCRIPT_TAG_RE)) {
    if (MODULE_TYPE_RE.test(`${attrs} `)) continue
    const match = SRC_ATTR_RE.exec(attrs)
    const src = match ? (match[1] ?? match[2] ?? match[3] ?? '').trim() : ''
    if (src && !NON_RELATIVE_SRC_RE.test(src)) srcs.push(src.split(/[?#]/)[0])
  }
  return srcs
}

export function listHtmlFiles(target: string): string[] {
  return listFiles(target).filter((file) => file.endsWith('.html'))
}

function listFiles(target: string): string[] {
  if (!fs.existsSync(target)) return []
  if (!fs.statSync(target).isDirectory()) return [target]
  return fs
    .readdirSync(target, { withFileTypes: true })
    .filter((entry) => !SKIPPED_DIRS.has(entry.name))
    .flatMap((entry) => listFiles(path.join(target, entry.name)))
}

export function resolvePageScripts(root: string, page: string): string[] {
  const base = path.resolve(root)
  return classicScriptSrcs(fs.readFileSync(page, 'utf-8'))
    .map((src) => path.resolve(path.dirname(page), src))
    .filter((script) => script.startsWith(base + path.sep))
}

export function classicParseError(code: string, filename: string): string | null {
  try {
    new vm.Script(code, { filename })
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

function pageScriptNames(page: string, html: string): string[] {
  return classicScriptSrcs(html)
    .map((src) => path.posix.normalize(path.posix.join(path.posix.dirname(page), src)))
    .filter((script) => script !== '..' && !script.startsWith('../'))
}

export function findPageScriptProblems(files: PackageFiles): PageScriptProblem[] {
  const shipped = new Set(files.names)
  return files.names
    .filter((name) => name.endsWith('.html'))
    .flatMap((page) =>
      pageScriptNames(page, files.read(page) ?? '').flatMap((script): PageScriptProblem[] => {
        const code = shipped.has(script) ? files.read(script) : null
        if (code === null) return [{ page, script, reason: 'missing' }]
        const detail = classicParseError(code, script)
        return detail ? [{ page, script, reason: 'not-a-classic-script', detail }] : []
      })
    )
}

function workingTreeFiles(cwd: string, manifest: Parameters<typeof collectPackageEntries>[1]): PackageFiles {
  const names = collectPackageEntries(cwd, manifest)
    .flatMap((entry) => listFiles(path.join(cwd, entry)))
    .map((file) => path.relative(cwd, file).split(path.sep).join('/'))
  return { names, read: (name) => fs.readFileSync(path.join(cwd, name), 'utf-8') }
}

function describeProblem(problem: PageScriptProblem): string {
  if (problem.reason === 'missing') return `${problem.page} loads ${problem.script}, which is not in the package`
  return `${problem.page} loads ${problem.script} as a plain script, but it fails to load (${problem.detail})`
}

function checkPageScripts(files: PackageFiles, opts: { flat: boolean }): PreflightResult {
  const name = 'Panel scripts'
  const pageCount = files.names.filter((file) => file.endsWith('.html')).length
  const problems = findPageScriptProblems(files)
  if (problems.length > 0) {
    const named = problems.slice(0, MAX_NAMED_PROBLEMS).map(describeProblem).join('; ')
    const rest = problems.length - MAX_NAMED_PROBLEMS
    return {
      name,
      status: 'fail',
      message: `${named}${rest > 0 ? ` (+${rest} more)` : ''}`,
      suggestion: opts.flat ? FLAT_REMEDY : TYPESCRIPT_REMEDY
    }
  }
  if (pageCount === 0) return { name, status: 'pass', message: 'No HTML pages to check' }
  return { name, status: 'pass', message: `Every page script loads (${pageCount} page(s) checked)` }
}

export function pageScriptsResult(
  cwd: string,
  manifest: Parameters<typeof collectPackageEntries>[1],
  packagePath?: string
): PreflightResult {
  const flat = !isTypeScriptProject(cwd)
  if (!packagePath) return checkPageScripts(workingTreeFiles(cwd, manifest), { flat })
  try {
    const files = readPackageFiles(packagePath)
    if (files) return checkPageScripts(files, { flat })
  } catch {
    return unreadablePackage(packagePath)
  }
  return unreadablePackage(packagePath)
}

function unreadablePackage(packagePath: string): PreflightResult {
  return {
    name: 'Panel scripts',
    status: 'fail',
    message: `Could not read ${path.basename(packagePath)} to check its page scripts`,
    suggestion: "Run 'amc-plugin package' to rebuild it."
  }
}
