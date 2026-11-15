export interface WidgetSpecProblem {
  path: string
  message: string
}

export interface DroppedSidebarRow {
  index: number
  id?: string
  reason: string
}

export interface SidebarItemsCheck {
  kept: unknown[]
  dropped: DroppedSidebarRow[]
  refused?: string
}

export type DeclaredWidgetKind = 'tile' | 'panel'

export interface DeclaredWidget {
  id: string
  title: string
  kind: DeclaredWidgetKind
}

export interface PreviewWidget extends DeclaredWidget {
  spec?: unknown
  problems?: WidgetSpecProblem[]
}

export interface PreviewRows {
  kept: unknown[]
  dropped: DroppedSidebarRow[]
  refused?: string
}

export interface PreviewSnapshot {
  widgets: PreviewWidget[]
  rows: PreviewRows
  badge: number
}

export interface WidgetSelector {
  widgetId?: unknown
}

export interface PreviewStateOptions {
  widgets: DeclaredWidget[]
  validateWidgetSpec(spec: unknown): WidgetSpecProblem[]
  validateSidebarItems(items: unknown): SidebarItemsCheck
  notify(snapshot: PreviewSnapshot): void
  throttleMs: number
  accessProblem?(): string | undefined
}

export interface PreviewState {
  setWidget(spec: unknown, selector?: WidgetSelector): void
  clearWidget(selector?: WidgetSelector): void
  setRows(items: unknown): void
  setBadge(count: unknown): void
  setDeclared(widgets: DeclaredWidget[]): void
  snapshot(): PreviewSnapshot
}

export interface ManifestWidgetSource {
  plugin?: { id?: string; name?: string }
  permissions?: string[]
  ui?: { widgets?: unknown }
}

const CHROME_PERMISSION = 'chrome'
const CHROME_WIDGET_PERMISSION = 'chrome.widget'

export const WIDGET_PERMISSION_REFUSAL =
  'chrome and chrome.widget permissions are required for the widget namespace'

export function widgetAccessProblem(manifest: ManifestWidgetSource): string | undefined {
  const granted = manifest.permissions ?? []
  const allowed = granted.includes(CHROME_PERMISSION) && granted.includes(CHROME_WIDGET_PERMISSION)
  return allowed ? undefined : WIDGET_PERMISSION_REFUSAL
}

function isDeclaredWidget(value: unknown): value is DeclaredWidget {
  const widget = value as Partial<DeclaredWidget> | null
  return (
    typeof widget === 'object' &&
    widget !== null &&
    typeof widget.id === 'string' &&
    typeof widget.title === 'string' &&
    (widget.kind === 'tile' || widget.kind === 'panel')
  )
}

export function widgetsFromManifest(manifest: ManifestWidgetSource): DeclaredWidget[] {
  const declared = manifest.ui?.widgets
  if (Array.isArray(declared) && declared.length > 0) {
    return declared
      .filter(isDeclaredWidget)
      .map(({ id, title, kind }) => ({ id, title, kind }))
  }
  if (!manifest.permissions?.includes(CHROME_WIDGET_PERMISSION)) return []
  const pluginId = manifest.plugin?.id ?? 'plugin'
  return [{ id: pluginId, title: manifest.plugin?.name ?? pluginId, kind: 'tile' }]
}

function describeProblems(problems: WidgetSpecProblem[]): string {
  const lines = problems.map((p) => (p.path ? `${p.path}: ${p.message}` : p.message))
  return `widget spec rejected: ${lines.join('; ')}`
}

function requestedId(selector: WidgetSelector | undefined): string | undefined {
  return typeof selector?.widgetId === 'string' ? selector.widgetId : undefined
}

function normaliseBadge(count: unknown): number {
  return typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0
}

function emptyRows(): PreviewRows {
  return { kept: [], dropped: [] }
}

function createThrottle(throttleMs: number, fire: () => void): () => void {
  let lastFiredAt = Number.NEGATIVE_INFINITY
  let pending: ReturnType<typeof setTimeout> | null = null
  const run = (): void => {
    lastFiredAt = Date.now()
    fire()
  }
  return () => {
    if (pending) return
    const wait = lastFiredAt + throttleMs - Date.now()
    if (wait <= 0) {
      run()
      return
    }
    pending = setTimeout(() => {
      pending = null
      run()
    }, wait)
  }
}

class PreviewStore implements PreviewState {
  private widgets: PreviewWidget[]
  private rows: PreviewRows = emptyRows()
  private badge = 0
  private readonly changed: () => void

  constructor(private readonly options: PreviewStateOptions) {
    this.widgets = options.widgets.map((widget) => ({ ...widget }))
    this.changed = createThrottle(options.throttleMs, () => options.notify(this.snapshot()))
  }

  snapshot(): PreviewSnapshot {
    return {
      widgets: this.widgets.map((widget) => ({ ...widget })),
      rows: { ...this.rows, kept: [...this.rows.kept], dropped: [...this.rows.dropped] },
      badge: this.badge,
    }
  }

  setWidget(spec: unknown, selector?: WidgetSelector): void {
    this.assertAccess()
    const problems = this.options.validateWidgetSpec(spec)
    if (problems.length > 0) this.rejectSpec(problems, selector)
    this.update(this.resolveId(selector), { spec, problems: undefined })
  }

  clearWidget(selector?: WidgetSelector): void {
    this.assertAccess()
    if (requestedId(selector) !== undefined) {
      this.update(this.resolveId(selector), { spec: undefined, problems: undefined })
      return
    }
    this.widgets = this.widgets.map(({ id, title, kind }) => ({ id, title, kind }))
    this.changed()
  }

  setRows(items: unknown): void {
    const check = this.options.validateSidebarItems(items)
    this.rows = { kept: check.kept, dropped: check.dropped, refused: check.refused }
    this.changed()
  }

  setBadge(count: unknown): void {
    this.badge = normaliseBadge(count)
    this.changed()
  }

  setDeclared(next: DeclaredWidget[]): void {
    this.widgets = next.map((declared) => {
      const previous = this.find(declared.id)
      return { ...declared, spec: previous?.spec, problems: previous?.problems }
    })
    this.changed()
  }

  private assertAccess(): void {
    const problem = this.options.accessProblem?.()
    if (problem) throw new Error(problem)
  }

  private find(id: string): PreviewWidget | undefined {
    return this.widgets.find((widget) => widget.id === id)
  }

  private resolveId(selector: WidgetSelector | undefined): string {
    const requested = requestedId(selector)
    if (requested === undefined) {
      if (this.widgets.length === 0) throw new Error('this plugin declares no widgets')
      return this.widgets[0].id
    }
    if (!this.find(requested)) throw new Error(`this plugin declares no widget called "${requested}"`)
    return requested
  }

  private update(id: string, patch: Partial<PreviewWidget>): void {
    this.widgets = this.widgets.map((widget) => (widget.id === id ? { ...widget, ...patch } : widget))
    this.changed()
  }

  private rejectSpec(problems: WidgetSpecProblem[], selector?: WidgetSelector): never {
    const target = requestedId(selector) ?? this.widgets[0]?.id
    if (target !== undefined && this.find(target)) this.update(target, { problems })
    throw new Error(describeProblems(problems))
  }
}

export function createPreviewState(options: PreviewStateOptions): PreviewState {
  return new PreviewStore(options)
}
