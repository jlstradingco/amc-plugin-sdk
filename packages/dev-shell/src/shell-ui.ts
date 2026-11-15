import type { PreviewRows, PreviewSnapshot, PreviewWidget } from './preview-state.js'

export const PREVIEW_BANNER =
  "Preview — data checked with Omniscio's own rules; widget actions answer as if the widget is placed in your sidebar, and the app draws the final look."
export const WAITING_TEXT = 'Waiting for widget.set'
export const PANEL_TEXT = "Panel widget: shows your plugin's page (on the right)"

const TONES = ['neutral', 'running', 'needs-you', 'error', 'ember', 'accent']
const COMPACT_SHAPES = ['stat', 'pill', 'dot', 'gauge', 'sparkline']
const PERCENT = 100
const SPARK_WIDTH = 100
const SPARK_HEIGHT = 24
const SPARK_PADDING = 2
const MIN_SERIES_POINTS = 2

type Fields = Record<string, unknown>

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])
}

function asFields(value: unknown): Fields {
  return typeof value === 'object' && value !== null ? (value as Fields) : {}
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function toneName(value: unknown): string {
  return typeof value === 'string' && TONES.includes(value) ? value : 'neutral'
}

function toneBadge(value: unknown): string {
  if (typeof value !== 'string') return ''
  return `<span class="tone tone-${toneName(value)}">${esc(value)}</span>`
}

function bar(fraction: unknown, scale: number): string {
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return ''
  const percent = Math.round(Math.min(Math.max(fraction / scale, 0), 1) * PERCENT)
  return `<div class="bar"><div class="fill" style="width:${percent}%"></div></div>`
}

function numbersOf(series: unknown): number[] {
  if (!Array.isArray(series)) return []
  return series.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
}

function chartSvg(series: unknown): string {
  const points = numbersOf(series)
  if (points.length < MIN_SERIES_POINTS) return ''
  const min = Math.min(...points)
  const span = Math.max(...points) - min || 1
  const usableHeight = SPARK_HEIGHT - SPARK_PADDING * 2
  const step = SPARK_WIDTH / (points.length - 1)
  const coords = points.map((n, i) => {
    const y = SPARK_HEIGHT - SPARK_PADDING - ((n - min) / span) * usableHeight
    return `${(i * step).toFixed(1)},${y.toFixed(1)}`
  })
  return (
    `<svg class="spark" viewBox="0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}" preserveAspectRatio="none">` +
    `<polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${coords.join(' ')}"/></svg>`
  )
}

function buttonChips(buttons: unknown): string {
  if (!Array.isArray(buttons)) return ''
  const chips = buttons.map((raw) => {
    const button = asFields(raw)
    const asks = `${text(button.action)} ${text(button.target)}`.trim()
    return (
      `<span class="chip" data-button="${esc(button.id)}" data-asks="${esc(asks)}">` +
      `${esc(button.label)} <small>${esc(asks)}</small></span>`
    )
  })
  return `<div class="chips">${chips.join('')}</div>`
}

function listItems(items: unknown): string {
  if (!Array.isArray(items)) return ''
  const rows = items.map((raw) => {
    const item = asFields(raw)
    return (
      `<li><span class="label">${esc(item.label)}</span>` +
      `<span class="detail">${esc(item.detail)}</span>${toneBadge(item.tone)}</li>`
    )
  })
  return `<ul class="items">${rows.join('')}</ul>`
}

function valueAndLabel(spec: Fields): string {
  return (
    `<div class="value">${esc(spec.value)}</div>` +
    `<div class="label">${esc(spec.label)}</div>${toneBadge(spec.tone)}`
  )
}

function compactBody(shape: string, spec: Fields): string {
  if (shape === 'gauge') return valueAndLabel(spec) + bar(spec.progress, 1)
  if (shape === 'sparkline') return valueAndLabel(spec) + chartSvg(spec.series)
  return valueAndLabel(spec)
}

function shapeBody(shape: string, spec: Fields): string | null {
  if (COMPACT_SHAPES.includes(shape)) return compactBody(shape, spec)
  switch (shape) {
    case 'list':
      return listItems(spec.items) + toneBadge(spec.tone)
    case 'chart':
      return chartSvg(spec.series) + toneBadge(spec.tone)
    case 'note':
      return `<p class="note">${esc(spec.text)}</p>${toneBadge(spec.tone)}`
    case 'progress':
      return valueAndLabel(spec) + bar(spec.progress, 1)
    default:
      return null
  }
}

function renderFace(raw: unknown): string {
  const spec = asFields(raw)
  const shape = text(spec.shape)
  const body = shapeBody(shape, spec)
  if (body === null) {
    return `<div class="problems">This preview does not know the shape ${esc(shape)}</div>`
  }
  const title = typeof spec.title === 'string' ? `<div class="face-title">${esc(spec.title)}</div>` : ''
  return title + body + buttonChips(spec.buttons)
}

function renderProblems(problems: NonNullable<PreviewWidget['problems']>): string {
  const lines = problems.map((p) => `<li>${p.path ? `${esc(p.path)}: ` : ''}${esc(p.message)}</li>`)
  return `<ul class="problems">${lines.join('')}</ul>`
}

function renderWidgetBody(widget: PreviewWidget): string {
  if (widget.problems && widget.problems.length > 0) return renderProblems(widget.problems)
  if (widget.kind === 'panel') return `<div class="muted">${PANEL_TEXT}</div>`
  if (widget.spec === undefined) return `<div class="muted">${WAITING_TEXT}</div>`
  return renderFace(widget.spec)
}

function renderWidget(widget: PreviewWidget): string {
  return (
    `<section class="frame" data-widget="${esc(widget.id)}">` +
    `<header><span class="title">${esc(widget.title)}</span>` +
    `<span class="kind">${esc(widget.kind)}</span></header>` +
    `<div class="body">${renderWidgetBody(widget)}</div></section>`
  )
}

function renderRow(raw: unknown): string {
  const row = asFields(raw)
  const needsYou = row.needsYou === true ? '<span class="needs-you-dot" title="Needs you"></span>' : ''
  const steps =
    typeof row.currentStep === 'number' && typeof row.totalSteps === 'number'
      ? `<small>Step ${esc(row.currentStep)}/${esc(row.totalSteps)}</small>`
      : ''
  return (
    `<li class="row">${needsYou}<span class="label">${esc(row.title)}</span>` +
    `<span class="chip status">${esc(row.status)}</span>${steps}${bar(row.progress, PERCENT)}</li>`
  )
}

function renderDropped(dropped: PreviewRows['dropped']): string {
  const lines = dropped.map((d) => {
    const who = d.id === undefined ? '' : ` (${esc(d.id)})`
    return `<li>Row ${esc(d.index)}${who} was dropped: ${esc(d.reason)}</li>`
  })
  return lines.length > 0 ? `<ul class="problems">${lines.join('')}</ul>` : ''
}

function renderRows(rows: PreviewRows, badge: number): string {
  const badgeText = badge > 0 ? `Badge: ${esc(badge)}` : 'Badge: none'
  const kept = rows.kept.length > 0 ? `<ul class="items">${rows.kept.map(renderRow).join('')}</ul>` : ''
  const refused = rows.refused === undefined ? '' : `<div class="problems">${esc(rows.refused)}</div>`
  const empty = kept === '' && refused === '' && rows.dropped.length === 0
  return (
    `<section class="frame rows"><header><span class="title">Sidebar rows</span>` +
    `<span class="kind">${badgeText}</span></header><div class="body">` +
    `${kept}${renderDropped(rows.dropped)}${refused}` +
    `${empty ? '<div class="muted">No rows yet</div>' : ''}</div></section>`
  )
}

export function renderSidebarPreview(snapshot: PreviewSnapshot): string {
  return (
    `<div class="banner">${PREVIEW_BANNER}</div>` +
    snapshot.widgets.map(renderWidget).join('') +
    renderRows(snapshot.rows, snapshot.badge)
  )
}

export function renderPreviewScript(snapshot: PreviewSnapshot): string {
  const html = renderSidebarPreview(snapshot)
  return `document.getElementById('preview').innerHTML = ${JSON.stringify(html)}`
}

export function reloadPluginViewScript(): string {
  return "document.getElementById('plugin-view').reload()"
}
