import {
  SIDEBAR_ITEM_GRADE_MAX,
  SIDEBAR_ITEM_ID_MAX,
  SIDEBAR_ITEM_ID_MIN,
  SIDEBAR_ITEM_LAST_SCAN_DATE_MAX,
  SIDEBAR_ITEM_PROGRESS_MAX,
  SIDEBAR_ITEM_PROGRESS_MIN,
  SIDEBAR_ITEM_SCORE_MAX,
  SIDEBAR_ITEM_SCORE_MIN,
  SIDEBAR_ITEM_STATUS_MAX,
  SIDEBAR_ITEM_STEP_MIN,
  SIDEBAR_ITEM_SUBTITLE_MAX,
  SIDEBAR_ITEM_TITLE_MAX,
  SIDEBAR_ITEMS_MAX,
} from '../generated/sdk-facts.js'
import type { SidebarItem } from '../types/context.js'
import {
  checkBoolean,
  checkCount,
  isRecord,
  numberCheck,
  optionalField,
  requiredField,
  stringCheck,
  type FieldProblem,
} from './field-checks.js'

/** A sidebar row the app would drop, with its position and the first thing wrong with it. */
export interface DroppedSidebarRow {
  index: number
  id?: string
  reason: string
}

/** The outcome of checking a `setItems` batch: rows the app keeps, rows it drops, or a refusal. */
export interface SidebarItemsCheck {
  kept: SidebarItem[]
  dropped: DroppedSidebarRow[]
  refused?: string
}

const STEP_CHECK = numberCheck({ integer: true, min: SIDEBAR_ITEM_STEP_MIN })

function rowProblems(row: unknown): FieldProblem[] {
  if (!isRecord(row)) return [{ path: 'row', message: 'row must be an object' }]
  return [
    ...requiredField(row, 'id', stringCheck({ min: SIDEBAR_ITEM_ID_MIN, max: SIDEBAR_ITEM_ID_MAX })),
    ...requiredField(row, 'title', stringCheck({ max: SIDEBAR_ITEM_TITLE_MAX })),
    ...optionalField(row, 'subtitle', stringCheck({ max: SIDEBAR_ITEM_SUBTITLE_MAX })),
    ...requiredField(row, 'status', stringCheck({ max: SIDEBAR_ITEM_STATUS_MAX })),
    ...optionalField(row, 'needsYou', checkBoolean),
    ...optionalField(
      row,
      'progress',
      numberCheck({ min: SIDEBAR_ITEM_PROGRESS_MIN, max: SIDEBAR_ITEM_PROGRESS_MAX })
    ),
    ...optionalField(row, 'currentStep', STEP_CHECK),
    ...optionalField(row, 'totalSteps', STEP_CHECK),
    ...optionalField(row, 'grade', stringCheck({ max: SIDEBAR_ITEM_GRADE_MAX })),
    ...optionalField(
      row,
      'score',
      numberCheck({ integer: true, min: SIDEBAR_ITEM_SCORE_MIN, max: SIDEBAR_ITEM_SCORE_MAX })
    ),
    ...optionalField(row, 'lastScanDate', stringCheck({ max: SIDEBAR_ITEM_LAST_SCAN_DATE_MAX })),
  ]
}

function droppedRow(row: unknown, index: number, problem: FieldProblem): DroppedSidebarRow {
  const id = isRecord(row) && typeof row.id === 'string' ? { id: row.id } : {}
  return { index, ...id, reason: problem.message }
}

/** Splits a `setItems` batch into the rows the app keeps and the rows it silently drops. */
export function validateSidebarItems(items: unknown): SidebarItemsCheck {
  const refusal = checkCount(items, 'items', { max: SIDEBAR_ITEMS_MAX })[0]
  if (refusal || !Array.isArray(items)) {
    return { kept: [], dropped: [], refused: refusal?.message ?? 'items must be a list' }
  }
  const check: SidebarItemsCheck = { kept: [], dropped: [] }
  for (let index = 0; index < items.length; index += 1) {
    const problem = rowProblems(items[index])[0]
    if (problem) check.dropped.push(droppedRow(items[index], index, problem))
    else check.kept.push(items[index] as SidebarItem)
  }
  return check
}
