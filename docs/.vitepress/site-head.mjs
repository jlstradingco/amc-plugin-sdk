// @script what="Gives every VitePress SDK page the shared help-site <head> block — canonical, Open Graph, Twitter card and the site icon set — from the same module the rest of docs.omniscio.com uses."

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clampDescription, helpSiteHead } from '../../../scripts/lib/help-site-head.mjs'

export const SDK_SITE_TITLE = 'Omniscio Plugin SDK'
export const SDK_SITE_DESCRIPTION = 'Build plugins for Omniscio'

const BASE_PATH = '/sdk/'
const NOT_FOUND_SOURCE = '404.md'
const DOCS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/
const NOT_LEAD_RE = /^(?:#|:::|<|\||[-*+]\s|\d+\.\s|\*\*Availability|\*\*Required Permission)/

/**
 * The URL this page is served at, which its canonical must name.
 *
 * A directory's `index.md` is served at the directory URL (`/sdk/api/`), NOT at
 * `/sdk/api/index.html` — Firebase answers both, so the directory form is the one canonical and
 * the pair collapses to a single URL with no redirect rule.
 *
 * @param {string} relativePath VitePress's page source path, e.g. `guide/quickstart.md`.
 * @returns {string|null} The served path, or null for a page that is not a landing page.
 */
export function sdkPagePath(relativePath) {
  const rel = String(relativePath ?? '').replace(/\\/g, '/')
  if (!rel || rel === NOT_FOUND_SOURCE) return null
  const clean = rel.replace(/\.md$/, '')
  if (clean === 'index') return BASE_PATH
  if (clean.endsWith('/index')) return `${BASE_PATH}${clean.slice(0, -'index'.length)}`
  return `${BASE_PATH}${clean}.html`
}

const TAG_RE = /<(link|meta)\s([^>]*?)\/?>/g
const ATTR_RE = /([\w:-]+)="([^"]*)"/g

function decodeAttribute(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * VitePress head tags as `[tagName, attributes]` pairs.
 *
 * VitePress accepts no raw HTML in its head, so the shared block is written once as HTML and read
 * back here — a second hand-written tag list beside it is exactly how the two drift apart.
 * @param {string} html
 * @returns {[string, Record<string, string>][]}
 */
export function headTagsFromHtml(html) {
  const tags = []
  for (const [, name, attributes] of String(html).matchAll(TAG_RE)) {
    const attrs = {}
    for (const [, key, value] of attributes.matchAll(ATTR_RE)) attrs[key] = decodeAttribute(value)
    tags.push([name, attrs])
  }
  return tags
}

const INLINE_MARKUP = [
  [/```[\s\S]*?```/g, ' '],
  [/`([^`]*)`/g, '$1'],
  [/!\[[^\]]*\]\([^)]*\)/g, ' '],
  [/\[([^\]]*)\]\([^)]*\)/g, '$1'],
  [/<[^>]+>/g, ' '],
  [/\*\*([^*]+)\*\*/g, '$1'],
  [/__([^_]+)__/g, '$1'],
  [/(^|\s)[*_]([^*_\s][^*_]*)[*_]/g, '$1$2']
]

function plainTextOf(markdown) {
  return INLINE_MARKUP.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), markdown)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The description an SDK page carries when nothing names one itself: the first real sentence of
 * the page's own copy, so no two /sdk/ pages share a meta description.
 * @param {string} relativePath VitePress's page source path, e.g. `api/ai.md`.
 * @returns {string} The description, or an empty string when the page has no usable lead.
 */
export function sdkPageDescription(relativePath) {
  const rel = String(relativePath ?? '').replace(/\\/g, '/')
  if (!rel || rel.startsWith('..') || rel === NOT_FOUND_SOURCE) return ''
  let source
  try {
    source = readFileSync(join(DOCS_ROOT, rel), 'utf8')
  } catch {
    return ''
  }
  for (const block of source.replace(FRONTMATTER_RE, '').split(/\r?\n[ \t]*\r?\n/)) {
    const lead = block.trim()
    if (!lead || NOT_LEAD_RE.test(lead)) continue
    const text = plainTextOf(lead)
    if (text.length < 40) continue
    return clampDescription(text)
  }
  return ''
}

/**
 * The head tags one SDK page carries.
 * @param {{ relativePath: string, title?: string, description?: string }} page
 * @returns {[string, Record<string, string>][]}
 */
export function sdkHeadTags({ relativePath, title, description }) {
  const path = sdkPagePath(relativePath)
  if (!path) return []
  return headTagsFromHtml(
    helpSiteHead({
      title: title || SDK_SITE_TITLE,
      description: description || SDK_SITE_DESCRIPTION,
      path
    })
  )
}
