import type { Finding } from '../lib/findings.js'

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

export function checkSecrets(recipe: Record<string, unknown>): Finding[] {
  const findings: Finding[] = []

  inspect(findings, 'description', recipe.description)
  inspect(findings, 'runLabel', recipe.runLabel)

  const steps = Array.isArray(recipe.steps) ? recipe.steps : []
  steps.forEach((step, index) => {
    if (typeof step !== 'object' || step === null) return
    const s = step as Record<string, unknown>
    const name = typeof s.name === 'string' ? s.name : undefined
    inspect(findings, `steps[${index}].prompt`, s.prompt, name)
    inspect(findings, `steps[${index}].exitMessage`, s.exitMessage, name)
  })

  return findings
}
