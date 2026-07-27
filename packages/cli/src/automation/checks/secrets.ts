import type { Finding } from '../lib/findings.js'
import { collectAllSteps } from '../lib/recipe-steps.js'
import { SHAREABLE_FIELDS } from '../lib/envelope.js'

/**
 * Key/path shapes worth a second look. Mirrors the spirit of AMC's own
 * SECRET_PATTERNS. WARNINGS only — a published automation is world-readable, so
 * flagging is worth a little noise, but a false positive must never block a
 * publish. The author is the only one who can tell.
 */
const SECRET_PATTERNS: ReadonlyArray<{ re: RegExp; hint: string }> = [
  { re: /sk-ant-[A-Za-z0-9-]{8,}/, hint: 'looks like an Anthropic API key' },
  { re: /sk-[A-Za-z0-9]{20,}/, hint: 'looks like an API key' },
  { re: /\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{20,}\b/, hint: 'looks like a GitHub token' },
  { re: /github_pat_[A-Za-z0-9_]{20,}/, hint: 'looks like a GitHub token' },
  { re: /\bAIza[A-Za-z0-9_-]{20,}\b/, hint: 'looks like a Google API key' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, hint: 'looks like a Slack token' },
  { re: /\bAKIA[A-Z0-9]{16}\b/, hint: 'looks like an AWS access key' },
  { re: /Bearer\s+[A-Za-z0-9._-]{16,}/, hint: 'looks like a bearer token' },
  {
    re: /\b(?:api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*['"]?[A-Za-z0-9._\-/+]{12,}/i,
    hint: 'looks like a secret assignment'
  },
  { re: /[A-Za-z]:\\Users\\[^\\/\n]+/, hint: 'contains an absolute Windows user path' },
  { re: /\/(?:Users|home)\/[^/\n]+/, hint: 'contains an absolute user path' }
]

/**
 * Walked separately, by `collectAllSteps`, so their findings can name the step rather
 * than a bare index. Everything else on the envelope is swept generically below.
 */
const STEP_BEARING_FIELDS = new Set<string>(['steps', 'pipelines'])

/**
 * How deep the generic sweep descends. `parameters` and `supervisors` are
 * author-shaped with no fixed schema, so there is no natural stopping point — this
 * guards a pathologically nested file, it is not a real structural limit.
 */
const MAX_SCAN_DEPTH = 8

function scan(text: string): string | null {
  for (const { re, hint } of SECRET_PATTERNS) {
    if (re.test(text)) return hint
  }
  return null
}

function inspect(findings: Finding[], path: string, value: unknown, stepName?: string): void {
  if (typeof value !== 'string' || value.length === 0) return
  const hint = scan(value)
  if (!hint) return
  findings.push({
    severity: 'warning',
    code: 'possible-secret',
    message: `${path} ${hint}.`,
    ...(stepName ? { stepName } : {}),
    fix: 'Remove it before publishing — a published automation is public.'
  })
}

/** Recurse into arrays and plain objects, scanning every string underneath. */
function inspectDeep(findings: Finding[], path: string, value: unknown, depth = 0): void {
  if (typeof value === 'string') {
    inspect(findings, path, value)
    return
  }
  if (depth >= MAX_SCAN_DEPTH || value === null || typeof value !== 'object') return

  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectDeep(findings, `${path}[${index}]`, entry, depth + 1))
    return
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    inspectDeep(findings, `${path}.${key}`, entry, depth + 1)
  }
}

export function checkSecrets(recipe: Record<string, unknown>): Finding[] {
  const findings: Finding[] = []

  // Driven off the publish envelope's allow-list, so the scan covers exactly what a
  // publish SHIPS. Naming the fields by hand reached `description` and `runLabel` only,
  // which left `parameters`, `onComplete` and `supervisors` — all shareable, all able to
  // carry an author's string — travelling unscanned. Deriving the list means a field
  // added to the envelope is swept on the day it is added.
  for (const field of SHAREABLE_FIELDS) {
    if (STEP_BEARING_FIELDS.has(field)) continue
    inspectDeep(findings, field, recipe[field])
  }

  // Pipeline steps are scanned too. `pipelines` rides the publish envelope's
  // allow-list, so a key pasted into a pipeline prompt was published unflagged —
  // and AMC's own share-time scanner has always walked them.
  for (const { step: s, path, declaredName } of collectAllSteps(recipe)) {
    inspect(findings, `${path}.prompt`, s.prompt, declaredName)
    inspect(findings, `${path}.exitMessage`, s.exitMessage, declaredName)
  }

  return findings
}
