export const MAX_README_CHARS = 3000
export const DEVELOPMENT_DOC = 'docs/DEVELOPMENT.md'
const MAX_REPORTED_PROBLEMS = 5
const MAX_EXCERPT_CHARS = 60

export type ReadmeRule = 'raw-html' | 'badge-image' | 'developer-notes' | 'too-long'

export interface ReadmeProblem {
  rule: ReadmeRule
  line: number
  excerpt: string
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const INLINE_CODE = /`[^`\n]*`/g
const HTML_TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/
const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)/g
const BADGE_URL =
  /shields\.io|badgen\.net|badge\.fury\.io|codecov\.io|coveralls\.io|travis-ci\.|circleci\.com|\/badges?(?:[/.?]|$)|badge\.svg/i
const DEVELOPER_NOTES = /^\s{0,3}(?:#{1,6}\s*)?[*_]*developer notes\b/i
const DEVELOPER_NOTES_POINTER = /^\s*developer notes:\s*`?docs\/DEVELOPMENT\.md`?\.?\s*$/i

const RULE_LABEL: Record<ReadmeRule, string> = {
  'raw-html': 'raw HTML',
  'badge-image': 'a badge image',
  'developer-notes': 'a Developer notes section',
  'too-long': `more than ${MAX_README_CHARS} characters`
}

const clip = (value: string): string =>
  value.length > MAX_EXCERPT_CHARS ? `${value.slice(0, MAX_EXCERPT_CHARS)}...` : value

function* proseLines(lines: string[]): Generator<{ line: number; text: string }> {
  let fence: string | null = null
  for (let index = 0; index < lines.length; index++) {
    const text = lines[index] ?? ''
    const marker = FENCE.exec(text)?.[1]
    if (fence === null) {
      if (marker) fence = marker
      else yield { line: index + 1, text }
    } else if (marker && marker[0] === fence[0] && marker.length >= fence.length) {
      fence = null
    }
  }
}

function problemsOnLine(line: number, text: string): ReadmeProblem[] {
  const prose = text.replace(INLINE_CODE, '')
  const found: ReadmeProblem[] = []
  const tag = HTML_TAG.exec(prose)
  if (tag) found.push({ rule: 'raw-html', line, excerpt: clip(tag[0]) })
  for (const image of prose.matchAll(MARKDOWN_IMAGE)) {
    if (BADGE_URL.test(image[1] ?? '')) {
      found.push({ rule: 'badge-image', line, excerpt: clip(image[0]) })
    }
  }
  if (DEVELOPER_NOTES.test(text) && !DEVELOPER_NOTES_POINTER.test(text)) {
    found.push({ rule: 'developer-notes', line, excerpt: clip(text.trim()) })
  }
  return found
}

export function findReadmeProblems(readme: string): ReadmeProblem[] {
  const text = readme.replace(/^﻿/, '')
  const problems: ReadmeProblem[] = []
  for (const { line, text: lineText } of proseLines(text.split(/\r?\n/))) {
    problems.push(...problemsOnLine(line, lineText))
  }
  if (text.length > MAX_README_CHARS) {
    const line = text.slice(0, MAX_README_CHARS).split('\n').length
    problems.push({ rule: 'too-long', line, excerpt: `${text.length} characters` })
  }
  return problems
}

export function describeReadmeProblems(problems: ReadmeProblem[], fileName = 'README.md'): string {
  const shown = problems.slice(0, MAX_REPORTED_PROBLEMS).map((problem) => {
    return `${fileName} line ${problem.line}: ${RULE_LABEL[problem.rule]} (${problem.excerpt})`
  })
  const hidden = problems.length - shown.length
  if (hidden > 0) shown.push(`and ${hidden} more`)
  return shown.join('; ')
}
