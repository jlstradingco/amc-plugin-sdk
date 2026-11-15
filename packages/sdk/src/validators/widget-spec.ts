import {
  RICH_WIDGET_SHAPES,
  WIDGET_ACTION_IDS,
  WIDGET_BUTTON_ID_PATTERN_SOURCE,
  WIDGET_BUTTON_LABEL_MAX,
  WIDGET_BUTTON_LABEL_MIN,
  WIDGET_BUTTON_TARGET_MAX,
  WIDGET_BUTTON_TARGET_MIN,
  WIDGET_BUTTONS_MAX,
  WIDGET_CHART_SERIES_MAX,
  WIDGET_CHART_SERIES_MIN,
  WIDGET_ICON_MAX,
  WIDGET_ICON_MIN,
  WIDGET_ICON_NAME_PATTERN_SOURCE,
  WIDGET_LABEL_MAX,
  WIDGET_LIST_DETAIL_MAX,
  WIDGET_LIST_ITEMS_MAX,
  WIDGET_LIST_ITEMS_MIN,
  WIDGET_LIST_LABEL_MAX,
  WIDGET_LIST_LABEL_MIN,
  WIDGET_NOTE_MAX,
  WIDGET_NOTE_MIN,
  WIDGET_PANEL_MODES,
  WIDGET_PROGRESS_MAX,
  WIDGET_PROGRESS_MIN,
  WIDGET_SHAPES,
  WIDGET_SPARKLINE_SERIES_MAX,
  WIDGET_TITLE_MAX,
  WIDGET_TITLE_MIN,
  WIDGET_TONES,
  WIDGET_TOOLTIP_MAX,
  WIDGET_VALUE_MAX,
  type RichWidgetShape,
} from '../generated/sdk-facts.js'
import {
  checkCount,
  checkOneOf,
  isOneOf,
  isRecord,
  numberCheck,
  optionalField,
  requiredField,
  stringCheck,
  type FieldCheck,
  type FieldProblem,
} from './field-checks.js'

/** One reason the app would refuse a widget spec: the field it concerns and what is wrong. */
export interface WidgetSpecProblem {
  path: string
  message: string
}

const ICON_RULES = {
  min: WIDGET_ICON_MIN,
  max: WIDGET_ICON_MAX,
  pattern: new RegExp(WIDGET_ICON_NAME_PATTERN_SOURCE),
}
const BUTTON_ID_PATTERN = new RegExp(WIDGET_BUTTON_ID_PATTERN_SOURCE)
const TONE_CHECK = checkOneOf(WIDGET_TONES)
const PROGRESS_CHECK = numberCheck({ min: WIDGET_PROGRESS_MIN, max: WIDGET_PROGRESS_MAX })
const FINITE_CHECK = numberCheck({ finite: true })

function checkEach(value: unknown, path: string, check: FieldCheck): FieldProblem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry, index) => check(entry, `${path}[${index}]`))
}

function checkSeries(bounds: { min?: number; max: number }): FieldCheck {
  return (value, path) => [
    ...checkCount(value, path, bounds),
    ...checkEach(value, path, FINITE_CHECK),
  ]
}

function buttonProblems(value: unknown, path: string): FieldProblem[] {
  if (!isRecord(value)) return [{ path, message: `${path} must be an object` }]
  return [
    ...requiredField(value, 'id', stringCheck({ pattern: BUTTON_ID_PATTERN }), path),
    ...requiredField(
      value,
      'label',
      stringCheck({ trim: true, min: WIDGET_BUTTON_LABEL_MIN, max: WIDGET_BUTTON_LABEL_MAX }),
      path
    ),
    ...requiredField(value, 'action', checkOneOf(WIDGET_ACTION_IDS), path),
    ...requiredField(
      value,
      'target',
      stringCheck({ trim: true, min: WIDGET_BUTTON_TARGET_MIN, max: WIDGET_BUTTON_TARGET_MAX }),
      path
    ),
  ]
}

function duplicateButtonIds(buttons: unknown[], path: string): FieldProblem[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const button of buttons) {
    if (!isRecord(button) || typeof button.id !== 'string') continue
    if (seen.has(button.id)) repeated.add(button.id)
    seen.add(button.id)
  }
  return [...repeated].map((id) => ({
    path,
    message: `${path} has more than one button with the id "${id}"; ids must be unique`,
  }))
}

function buttonsProblems(value: unknown, path: string): FieldProblem[] {
  const count = checkCount(value, path, { max: WIDGET_BUTTONS_MAX })
  if (!Array.isArray(value)) return count
  return [
    ...count,
    ...checkEach(value, path, buttonProblems),
    ...duplicateButtonIds(value, path),
  ]
}

function sharedChromeProblems(spec: Record<string, unknown>): FieldProblem[] {
  return [
    ...optionalField(spec, 'tooltip', stringCheck({ max: WIDGET_TOOLTIP_MAX })),
    ...optionalField(spec, 'tone', TONE_CHECK),
    ...optionalField(spec, 'icon', stringCheck(ICON_RULES)),
    ...optionalField(spec, 'buttons', buttonsProblems),
    ...optionalField(spec, 'panel', checkOneOf(WIDGET_PANEL_MODES)),
  ]
}

function compactProblems(spec: Record<string, unknown>): FieldProblem[] {
  return [
    ...optionalField(spec, 'value', stringCheck({ max: WIDGET_VALUE_MAX })),
    ...optionalField(spec, 'label', stringCheck({ max: WIDGET_LABEL_MAX })),
    ...optionalField(spec, 'progress', PROGRESS_CHECK),
    ...optionalField(spec, 'series', checkSeries({ max: WIDGET_SPARKLINE_SERIES_MAX })),
    ...sharedChromeProblems(spec),
  ]
}

function richChromeProblems(spec: Record<string, unknown>): FieldProblem[] {
  return [
    ...optionalField(spec, 'title', stringCheck({ min: WIDGET_TITLE_MIN, max: WIDGET_TITLE_MAX })),
    ...sharedChromeProblems(spec),
  ]
}

function listItemProblems(value: unknown, path: string): FieldProblem[] {
  if (!isRecord(value)) return [{ path, message: `${path} must be an object` }]
  return [
    ...requiredField(
      value,
      'label',
      stringCheck({ min: WIDGET_LIST_LABEL_MIN, max: WIDGET_LIST_LABEL_MAX }),
      path
    ),
    ...optionalField(value, 'detail', stringCheck({ max: WIDGET_LIST_DETAIL_MAX }), path),
    ...optionalField(value, 'tone', TONE_CHECK, path),
  ]
}

function listProblems(spec: Record<string, unknown>): FieldProblem[] {
  const items: FieldCheck = (value, path) => [
    ...checkCount(value, path, { min: WIDGET_LIST_ITEMS_MIN, max: WIDGET_LIST_ITEMS_MAX }),
    ...checkEach(value, path, listItemProblems),
  ]
  return requiredField(spec, 'items', items)
}

function chartProblems(spec: Record<string, unknown>): FieldProblem[] {
  const bounds = { min: WIDGET_CHART_SERIES_MIN, max: WIDGET_CHART_SERIES_MAX }
  return requiredField(spec, 'series', checkSeries(bounds))
}

function noteProblems(spec: Record<string, unknown>): FieldProblem[] {
  return requiredField(spec, 'text', stringCheck({ min: WIDGET_NOTE_MIN, max: WIDGET_NOTE_MAX }))
}

function progressProblems(spec: Record<string, unknown>): FieldProblem[] {
  return [
    ...requiredField(spec, 'progress', PROGRESS_CHECK),
    ...optionalField(spec, 'label', stringCheck({ max: WIDGET_LABEL_MAX })),
    ...optionalField(spec, 'value', stringCheck({ max: WIDGET_VALUE_MAX })),
  ]
}

const RICH_SHAPE_PROBLEMS: Record<RichWidgetShape, (spec: Record<string, unknown>) => FieldProblem[]> = {
  list: listProblems,
  chart: chartProblems,
  note: noteProblems,
  progress: progressProblems,
}

function unknownShapeProblem(): WidgetSpecProblem {
  const allowed = [...WIDGET_SHAPES, ...RICH_WIDGET_SHAPES].join(', ')
  return { path: 'shape', message: `shape must be one of: ${allowed}` }
}

/** Lists why the app would refuse this widget spec; an empty list means it would accept it. */
export function validateWidgetSpec(spec: unknown): WidgetSpecProblem[] {
  if (!isRecord(spec)) return [{ path: 'spec', message: 'spec must be an object with a shape' }]
  const shape = spec.shape
  if (isOneOf(shape, WIDGET_SHAPES)) return compactProblems(spec)
  if (isOneOf(shape, RICH_WIDGET_SHAPES)) {
    return [...richChromeProblems(spec), ...RICH_SHAPE_PROBLEMS[shape](spec)]
  }
  return [unknownShapeProblem()]
}
