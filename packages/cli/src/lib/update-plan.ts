export type UpdateAction = 'up-to-date' | 'newer-than-latest' | 'update'

export interface UpdatePlan {
  action: UpdateAction
  message: string
  install: boolean
}

interface ParsedVersion {
  core: number[]
  prerelease: string[] | null
}

const VERSION_SHAPE = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

export function parseVersion(value: string): ParsedVersion | null {
  const match = VERSION_SHAPE.exec(value.trim())
  if (!match) return null
  return {
    core: match[1].split('.').map((part) => Number.parseInt(part, 10)),
    prerelease: match[2] ? match[2].split('.') : null
  }
}

function compareCore(left: number[], right: number[]): -1 | 0 | 1 {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0
    const b = right[index] ?? 0
    if (a !== b) return a < b ? -1 : 1
  }
  return 0
}

function compareIdentifier(left: string, right: string): -1 | 0 | 1 {
  const leftNumeric = /^\d+$/.test(left)
  const rightNumeric = /^\d+$/.test(right)
  if (leftNumeric && rightNumeric) {
    const a = Number(left)
    const b = Number(right)
    if (a === b) return 0
    return a < b ? -1 : 1
  }
  if (leftNumeric) return -1
  if (rightNumeric) return 1
  if (left === right) return 0
  return left < right ? -1 : 1
}

function comparePrerelease(left: string[] | null, right: string[] | null): -1 | 0 | 1 {
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === undefined) return -1
    if (b === undefined) return 1
    const verdict = compareIdentifier(a, b)
    if (verdict !== 0) return verdict
  }
  return 0
}

export function compareVersions(left: string, right: string): -1 | 0 | 1 {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  const core = compareCore(a.core, b.core)
  if (core !== 0) return core
  return comparePrerelease(a.prerelease, b.prerelease)
}

export function planUpdate(current: string, latest: string, check: boolean): UpdatePlan {
  const order = compareVersions(current, latest)
  if (order === 0) {
    return { action: 'up-to-date', message: 'Already up to date', install: false }
  }
  if (order > 0) {
    return {
      action: 'newer-than-latest',
      message: `${current} is newer than npm latest ${latest} — nothing to do`,
      install: false
    }
  }
  return {
    action: 'update',
    message: `Update available: ${current} → ${latest}`,
    install: !check
  }
}
