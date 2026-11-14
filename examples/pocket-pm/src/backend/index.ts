import type {
  PluginBackend,
  PluginBoards,
  PluginCalendar,
  PluginCalendarEvent,
  PluginContext,
  PluginControlledSession,
  PluginPeople,
  PluginSessionControl,
  PluginTasks,
  PluginTeamChat,
  PluginWriteCode,
  PluginWriteResult
} from '@omniscio/plugin-sdk'

const READ_LIMIT = 20
const MAX_CALENDARS = 10
const NAMES_SHOWN = 3
const DAYS_PER_WEEK = 7
const DAYS_FROM_SUNDAY_TO_MONDAY = 1
const NUDGE_TEXT = 'Quick check-in from Pocket PM: are you stuck? Reply with what you need.'
const UPDATE_HEADING = 'Pocket PM update'
const WAITING_STATUSES = new Set(['needs_you'])
const STUCK_STATUSES = new Set(['stalled', 'error'])

const WRITE_MESSAGES: Record<PluginWriteCode, string> = {
  FEATURE_OFF: 'This is turned off. Turn it on in Labs first.',
  NOT_FOUND: 'Pocket PM was not given that one. Pick it again first.',
  FORBIDDEN: 'You are not allowed to do that there.',
  INVALID: 'The text does not fit. Check it and try again.',
  CONFLICT: 'It could not be done right now. Refresh and try again.',
  RATE_LIMITED: 'Too many changes in a minute. Wait a moment and try again.',
  DECLINED: 'You said no, so nothing was sent.',
  BUSY: 'Another Pocket PM question is already open. Answer it first.',
  FAILED: 'Something went wrong inside Omniscio. Check before you try again.'
}

export interface StuckSession {
  id: string
  name: string
  status: string
}

export interface UpdateDraft {
  text: string
  stuckSessions: StuckSession[]
}

export type ActionCode = PluginWriteCode | 'OK' | 'UNSUPPORTED' | 'MISSING_INPUT'

export interface ActionResult {
  ok: boolean
  code: ActionCode
  message: string
}

export interface ChannelList {
  channels: { id: string; name: string }[]
  message: string
}

interface SessionReport {
  line: string
  stuck: StuckSession[]
}

function unsupported(feature: string): string {
  return `This Omniscio version does not support ${feature} yet.`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function plural(count: number, noun: string, more = false): string {
  return `${count}${more ? '+' : ''} ${noun}${count === 1 && !more ? '' : 's'}`
}

function countWithNames(names: string[], noun: string, more: boolean): string {
  const counted = plural(names.length, noun, more)
  if (names.length === 0) return counted
  const shown = names.slice(0, NAMES_SHOWN).join(', ')
  return `${counted} (${shown}${names.length > NAMES_SHOWN ? ', ...' : ''})`
}

function startOfDay(date: Date): Date {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  return start
}

function addDays(date: Date, days: number): Date {
  const moved = new Date(date)
  moved.setDate(moved.getDate() + days)
  return moved
}

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function weekRange(now: Date): { from: string; to: string } {
  const daysSinceMonday = (now.getDay() + DAYS_PER_WEEK - DAYS_FROM_SUNDAY_TO_MONDAY) % DAYS_PER_WEEK
  const monday = addDays(startOfDay(now), -daysSinceMonday)
  return { from: isoDay(monday), to: isoDay(addDays(monday, DAYS_PER_WEEK - 1)) }
}

async function readOr<T>(label: string, read: () => Promise<T>, onError: (line: string) => T): Promise<T> {
  try {
    return await read()
  } catch (error) {
    return onError(`${label}: could not read (${errorMessage(error)}).`)
  }
}

async function boardLine(boards: PluginBoards | undefined): Promise<string> {
  if (!boards) return unsupported('boards')
  const [board] = await boards.list()
  if (!board) return 'Board: none picked yet.'
  const page = await boards.listItems(board.id, { limit: READ_LIMIT })
  const names = page.items.map((item) => item.name)
  return `${board.name}: ${countWithNames(names, 'item', page.nextCursor !== null)}.`
}

async function taskLine(tasks: PluginTasks | undefined, now: Date): Promise<string> {
  if (!tasks) return unsupported('task lists')
  const [list] = await tasks.listLists()
  if (!list) return 'Tasks: no task list picked yet.'
  const dueBefore = addDays(startOfDay(now), 1).toISOString()
  const page = await tasks.list({ listId: list.id, done: false, dueBefore, limit: READ_LIMIT })
  const names = page.tasks.map((task) => task.text)
  return `Due on ${list.name}: ${countWithNames(names, 'task', page.nextCursor !== null)}.`
}

async function awayLine(people: PluginPeople | undefined, now: Date): Promise<string> {
  if (!people) return unsupported("people's schedules")
  const away = await people.timeOff.list(weekRange(now))
  const names = [...new Set(away.map((entry) => entry.name))]
  return names.length === 0 ? 'Nobody is away this week.' : `Away this week: ${names.join(', ')}.`
}

function eventLabel(event: PluginCalendarEvent): string {
  if (event.allDay) return `${event.title} (all day)`
  const time = new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${time} ${event.title}`
}

async function todaysEvents(calendar: PluginCalendar, now: Date): Promise<PluginCalendarEvent[] | null> {
  const picked = (await calendar.calendars.list()).slice(0, MAX_CALENDARS)
  if (picked.length === 0) return null
  const from = startOfDay(now).toISOString()
  const to = addDays(startOfDay(now), 1).toISOString()
  const pages = await Promise.all(
    picked.map((entry) => calendar.events.list({ calendarId: entry.id, from, to }))
  )
  return pages.flatMap((page) => page.events).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}

async function calendarLine(calendar: PluginCalendar | undefined, now: Date): Promise<string> {
  if (!calendar) return unsupported('calendars')
  const events = await todaysEvents(calendar, now)
  if (!events) return 'Calendar: none picked yet.'
  const labels = events.slice(0, READ_LIMIT).map(eventLabel)
  return `Today: ${countWithNames(labels, 'event', events.length > READ_LIMIT)}.`
}

function toStuck(session: PluginControlledSession): StuckSession {
  return { id: session.id, name: session.name, status: session.status }
}

async function sessionReport(control: PluginSessionControl | undefined): Promise<SessionReport> {
  if (!control) return { line: unsupported('session control'), stuck: [] }
  const sessions = await control.list()
  if (sessions.length === 0) return { line: 'Sessions: none picked yet.', stuck: [] }
  const waiting = sessions.filter((session) => WAITING_STATUSES.has(session.status)).length
  const stuck = sessions.filter((session) => STUCK_STATUSES.has(session.status)).map(toStuck)
  return { line: `Sessions: ${waiting} waiting on you, ${stuck.length} stuck.`, stuck }
}

async function buildUpdate(ctx: PluginContext): Promise<UpdateDraft> {
  const now = new Date()
  const asLine = (line: string): string => line
  const [board, tasks, away, calendar, sessions] = await Promise.all([
    readOr('Board', () => boardLine(ctx.boards), asLine),
    readOr('Tasks', () => taskLine(ctx.tasks, now), asLine),
    readOr('Away', () => awayLine(ctx.people, now), asLine),
    readOr('Calendar', () => calendarLine(ctx.calendar, now), asLine),
    readOr('Sessions', () => sessionReport(ctx.sessionControl), (line): SessionReport => ({ line, stuck: [] }))
  ])
  const text = [UPDATE_HEADING, board, tasks, away, calendar, sessions.line].join('\n')
  return { text, stuckSessions: sessions.stuck }
}

function refused(code: 'UNSUPPORTED' | 'MISSING_INPUT', message: string): ActionResult {
  return { ok: false, code, message }
}

function describeWrite<T>(result: PluginWriteResult<T>, success: string): ActionResult {
  if (result.ok) return { ok: true, code: 'OK', message: success }
  return { ok: false, code: result.code, message: WRITE_MESSAGES[result.code] }
}

async function listChannels(teamChat: PluginTeamChat | undefined): Promise<ChannelList> {
  if (!teamChat) return { channels: [], message: unsupported('Team Chat') }
  const channels = (await teamChat.channels.list()).map(({ id, name }) => ({ id, name }))
  return { channels, message: channels.length === 0 ? 'No Team Chat channel picked yet.' : '' }
}

async function nudge(control: PluginSessionControl | undefined, sessionId: unknown): Promise<ActionResult> {
  if (!control) return refused('UNSUPPORTED', unsupported('session control'))
  if (!isFilled(sessionId)) return refused('MISSING_INPUT', 'Pick a session to nudge first.')
  return describeWrite(await control.message(sessionId, NUDGE_TEXT), 'Nudge sent.')
}

async function postUpdate(
  teamChat: PluginTeamChat | undefined,
  channelId: unknown,
  text: unknown
): Promise<ActionResult> {
  if (!teamChat) return refused('UNSUPPORTED', unsupported('Team Chat'))
  if (!isFilled(channelId)) return refused('MISSING_INPUT', 'Pick a Team Chat channel first.')
  if (!isFilled(text)) return refused('MISSING_INPUT', 'Build your update first.')
  return describeWrite(await teamChat.messages.post(channelId, text), 'Posted to Team Chat.')
}

export default function activate(ctx: PluginContext): PluginBackend {
  ctx.rpc?.handle('buildUpdate', () => buildUpdate(ctx))
  ctx.rpc?.handle('listChannels', () => listChannels(ctx.teamChat))
  ctx.rpc?.handle('nudge', (sessionId) => nudge(ctx.sessionControl, sessionId))
  ctx.rpc?.handle('postUpdate', (channelId, text) => postUpdate(ctx.teamChat, channelId, text))
  return {}
}
