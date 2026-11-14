import type { Omniscio } from '@omniscio/plugin-sdk/browser'
import type { ActionResult, ChannelList, StuckSession, UpdateDraft } from '../backend/index'

const amc: Omniscio = window.Omniscio ?? window.AgentMC

const NO_BACKEND =
  'This Omniscio version cannot run the Pocket PM worker yet. Update Omniscio to build and post updates.'
const PICKING = 'Waiting for you to choose in the picker...'
const NO_STUCK = 'No stuck sessions right now.'
const SHARED = 'shared with Pocket PM.'

interface PickerSpec {
  buttonId: string
  open: () => Promise<string>
}

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

const buildBtn = byId<HTMLButtonElement>('build-btn')
const postBtn = byId<HTMLButtonElement>('post-btn')
const draftEl = byId<HTMLTextAreaElement>('draft')
const channelSelect = byId<HTMLSelectElement>('channel-select')
const channelNote = byId<HTMLParagraphElement>('channel-note')
const stuckList = byId<HTMLUListElement>('stuck-list')
const statusEl = byId<HTMLParagraphElement>('status')

function setStatus(message: string): void {
  statusEl.textContent = message
}

function unsupported(feature: string): string {
  return `This Omniscio version does not support ${feature} yet.`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

async function callBackend<T>(method: string, ...args: unknown[]): Promise<T | null> {
  if (!amc.backend) {
    setStatus(NO_BACKEND)
    return null
  }
  try {
    return (await amc.backend.invoke(method, ...args)) as T
  } catch (error) {
    setStatus(errorMessage(error))
    return null
  }
}

function updatePostButton(): void {
  postBtn.disabled = draftEl.value.trim() === '' || channelSelect.value === ''
}

function toOption(channel: { id: string; name: string }): HTMLOptionElement {
  const option = document.createElement('option')
  option.value = channel.id
  option.textContent = channel.name
  return option
}

async function refreshChannels(): Promise<void> {
  const list = await callBackend<ChannelList>('listChannels')
  if (!list) return
  channelSelect.replaceChildren(...list.channels.map(toOption))
  channelNote.textContent = list.message
  updatePostButton()
}

async function pickBoards(): Promise<string> {
  if (!amc.boards) return unsupported('boards')
  const outcome = await amc.boards.requestAccess()
  return `${plural(outcome.boards.length, 'board')} ${SHARED}`
}

async function pickTasks(): Promise<string> {
  if (!amc.tasks) return unsupported('task lists')
  const outcome = await amc.tasks.requestAccess()
  return outcome.allLists ? `All task lists ${SHARED}` : `${plural(outcome.lists.length, 'task list')} ${SHARED}`
}

async function pickCalendars(): Promise<string> {
  if (!amc.calendar) return unsupported('calendars')
  const outcome = await amc.calendar.requestAccess()
  if (outcome.allCalendars) return `All your calendars ${SHARED}`
  return `${plural(outcome.calendars.length, 'calendar')} ${SHARED}`
}

async function pickSessions(): Promise<string> {
  if (!amc.sessionControl) return unsupported('session control')
  const outcome = await amc.sessionControl.requestAccess()
  return `${plural(outcome.sessions.length, 'session')} and ${plural(outcome.projects.length, 'project')} ${SHARED}`
}

async function pickTeamChat(): Promise<string> {
  if (!amc.teamChat) return unsupported('Team Chat')
  const outcome = await amc.teamChat.requestAccess()
  await refreshChannels()
  if (outcome.allChannels) return `All your Team Chat conversations ${SHARED}`
  return `${plural(outcome.channels.length, 'conversation')} ${SHARED}`
}

const PICKERS: PickerSpec[] = [
  { buttonId: 'pick-boards', open: pickBoards },
  { buttonId: 'pick-tasks', open: pickTasks },
  { buttonId: 'pick-calendars', open: pickCalendars },
  { buttonId: 'pick-sessions', open: pickSessions },
  { buttonId: 'pick-team-chat', open: pickTeamChat }
]

function setPickersDisabled(disabled: boolean): void {
  PICKERS.forEach((spec) => {
    byId<HTMLButtonElement>(spec.buttonId).disabled = disabled
  })
}

async function runPicker(open: () => Promise<string>): Promise<void> {
  setPickersDisabled(true)
  setStatus(PICKING)
  try {
    setStatus(await open())
  } catch (error) {
    setStatus(errorMessage(error))
  } finally {
    setPickersDisabled(false)
  }
}

async function nudge(session: StuckSession, button: HTMLButtonElement): Promise<void> {
  button.disabled = true
  setStatus(`Omniscio will ask you before Pocket PM nudges ${session.name}.`)
  const result = await callBackend<ActionResult>('nudge', session.id)
  button.disabled = false
  if (result) setStatus(result.message)
}

function stuckItem(session: StuckSession): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'session'
  const label = document.createElement('span')
  label.textContent = `${session.name} (${session.status})`
  const button = document.createElement('button')
  button.className = 'secondary'
  button.textContent = 'Nudge'
  button.addEventListener('click', () => void nudge(session, button))
  item.append(label, button)
  return item
}

function emptyItem(message: string): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'empty'
  item.textContent = message
  return item
}

function renderStuck(sessions: StuckSession[]): void {
  if (sessions.length === 0) {
    stuckList.replaceChildren(emptyItem(NO_STUCK))
    return
  }
  stuckList.replaceChildren(...sessions.map(stuckItem))
}

async function buildUpdate(): Promise<void> {
  buildBtn.disabled = true
  setStatus('Building your update...')
  const draft = await callBackend<UpdateDraft>('buildUpdate')
  buildBtn.disabled = false
  if (!draft) return
  draftEl.value = draft.text
  renderStuck(draft.stuckSessions)
  updatePostButton()
  setStatus('Your update is ready. Read it, then post it when you are happy with it.')
}

async function postUpdate(): Promise<void> {
  postBtn.disabled = true
  setStatus('Omniscio will ask you before anything is posted.')
  const result = await callBackend<ActionResult>('postUpdate', channelSelect.value, draftEl.value)
  updatePostButton()
  if (result) setStatus(result.message)
}

PICKERS.forEach((spec) => {
  byId<HTMLButtonElement>(spec.buttonId).addEventListener('click', () => void runPicker(spec.open))
})
buildBtn.addEventListener('click', () => void buildUpdate())
postBtn.addEventListener('click', () => void postUpdate())
channelSelect.addEventListener('change', updatePostButton)

if (amc.backend) {
  void refreshChannels()
} else {
  buildBtn.disabled = true
  setStatus(NO_BACKEND)
}
