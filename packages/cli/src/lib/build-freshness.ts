import * as fs from 'node:fs'
import * as path from 'node:path'

export interface PackagingProblem {
  message: string
  suggestion: string
}

const BUILD_DIR = 'dist'
const SOURCE_DIR = 'src'
const PACKAGE_JSON = 'package.json'

interface NewestFile {
  relative: string
  mtimeMs: number
}

function newestFile(dir: string, root: string): NewestFile | null {
  let newest: NewestFile | null = null
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = newestFile(full, root)
      if (nested && (!newest || nested.mtimeMs > newest.mtimeMs)) newest = nested
      continue
    }
    const mtimeMs = fs.statSync(full).mtimeMs
    if (!newest || mtimeMs > newest.mtimeMs) {
      newest = { relative: path.relative(root, full).split(path.sep).join('/'), mtimeMs }
    }
  }
  return newest
}

export function staleBuild(cwd: string): PackagingProblem | null {
  const buildDir = path.join(cwd, BUILD_DIR)
  const sourceDir = path.join(cwd, SOURCE_DIR)
  if (!fs.existsSync(buildDir) || !fs.existsSync(sourceDir)) return null

  const source = newestFile(sourceDir, cwd)
  if (!source) return null

  const output = newestFile(buildDir, cwd)
  if (output && output.mtimeMs >= source.mtimeMs) return null

  return {
    message: output
      ? `${BUILD_DIR}/ is older than ${source.relative}, so the build no longer matches your sources`
      : `${BUILD_DIR}/ is empty although ${source.relative} exists, so there is no build output to package`,
    suggestion: `Run 'omniscio-plugin build', then package again. Packing now would ship code that does not match your sources.`
  }
}

function packageJsonVersion(cwd: string): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(cwd, PACKAGE_JSON), 'utf-8'))
    return typeof parsed?.version === 'string' ? parsed.version : null
  } catch {
    return null
  }
}

export function versionMismatch(cwd: string, manifestVersion: string): PackagingProblem | null {
  const packageVersion = packageJsonVersion(cwd)
  if (!packageVersion || !manifestVersion || packageVersion === manifestVersion) return null
  return {
    message: `${PACKAGE_JSON} is version ${packageVersion} but manifest.json declares ${manifestVersion}`,
    suggestion: `Set package.json and manifest.json to the same version, rebuild, then package again.`
  }
}

export function packagingProblems(cwd: string, manifestVersion: string): PackagingProblem[] {
  return [versionMismatch(cwd, manifestVersion), staleBuild(cwd)].filter(
    (problem): problem is PackagingProblem => problem !== null
  )
}
