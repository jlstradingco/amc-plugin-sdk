export interface FieldProblem {
  path: string
  message: string
}

export type FieldCheck = (value: unknown, path: string) => FieldProblem[]

export interface StringRules {
  min?: number
  max?: number
  trim?: boolean
  pattern?: RegExp
}

export interface NumberRules {
  min?: number
  max?: number
  integer?: boolean
  finite?: boolean
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function joinPath(prefix: string, key: string): string {
  return prefix ? `${prefix}.${key}` : key
}

function characters(count: number): string {
  return count === 1 ? '1 character' : `${count} characters`
}

function entries(count: number): string {
  return count === 1 ? '1 entry' : `${count} entries`
}

function lengthProblems(text: string, path: string, rules: StringRules): FieldProblem[] {
  if (rules.max !== undefined && text.length > rules.max) {
    return [{ path, message: `${path} is ${characters(text.length)}; the most allowed is ${rules.max}` }]
  }
  if (rules.min === undefined || text.length >= rules.min) return []
  const message =
    text.length === 0
      ? `${path} is empty; at least ${characters(rules.min)} required`
      : `${path} is ${characters(text.length)}; at least ${rules.min} required`
  return [{ path, message }]
}

function checkString(value: unknown, path: string, rules: StringRules): FieldProblem[] {
  if (typeof value !== 'string') return [{ path, message: `${path} must be text` }]
  const text = rules.trim ? value.trim() : value
  const problems = lengthProblems(text, path, rules)
  if (rules.pattern && !rules.pattern.test(text)) {
    problems.push({ path, message: `${path} must match ${rules.pattern.source}` })
  }
  return problems
}

function rangeProblems(value: number, path: string, rules: NumberRules): FieldProblem[] {
  if (rules.min !== undefined && value < rules.min) {
    return [{ path, message: `${path} is ${value}; the least allowed is ${rules.min}` }]
  }
  if (rules.max !== undefined && value > rules.max) {
    return [{ path, message: `${path} is ${value}; the most allowed is ${rules.max}` }]
  }
  return []
}

function checkNumber(value: unknown, path: string, rules: NumberRules): FieldProblem[] {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return [{ path, message: `${path} must be a number` }]
  }
  if (rules.finite && !Number.isFinite(value)) {
    return [{ path, message: `${path} must be a finite number` }]
  }
  if (rules.integer && !Number.isInteger(value)) {
    return [{ path, message: `${path} must be a whole number` }]
  }
  return rangeProblems(value, path, rules)
}

export function checkBoolean(value: unknown, path: string): FieldProblem[] {
  return typeof value === 'boolean' ? [] : [{ path, message: `${path} must be true or false` }]
}

export function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

export function checkOneOf(allowed: readonly string[]): FieldCheck {
  return (value, path) =>
    isOneOf(value, allowed) ? [] : [{ path, message: `${path} must be one of: ${allowed.join(', ')}` }]
}

export function checkCount(
  value: unknown,
  path: string,
  bounds: { min?: number; max: number }
): FieldProblem[] {
  if (!Array.isArray(value)) return [{ path, message: `${path} must be a list` }]
  if (value.length > bounds.max) {
    return [{ path, message: `${path} has ${entries(value.length)}; the most allowed is ${bounds.max}` }]
  }
  if (bounds.min !== undefined && value.length < bounds.min) {
    return [{ path, message: `${path} has ${entries(value.length)}; at least ${bounds.min} required` }]
  }
  return []
}

export function stringCheck(rules: StringRules): FieldCheck {
  return (value, path) => checkString(value, path, rules)
}

export function numberCheck(rules: NumberRules): FieldCheck {
  return (value, path) => checkNumber(value, path, rules)
}

export function requiredField(
  record: Record<string, unknown>,
  key: string,
  check: FieldCheck,
  prefix = ''
): FieldProblem[] {
  const path = joinPath(prefix, key)
  return record[key] === undefined ? [{ path, message: `${path} is required` }] : check(record[key], path)
}

export function optionalField(
  record: Record<string, unknown>,
  key: string,
  check: FieldCheck,
  prefix = ''
): FieldProblem[] {
  return record[key] === undefined ? [] : check(record[key], joinPath(prefix, key))
}
