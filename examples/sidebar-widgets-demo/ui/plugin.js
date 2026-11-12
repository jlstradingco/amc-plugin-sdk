const amc = window.Omniscio ?? window.AgentMC
const statusEl = document.getElementById('status')
const AGENDA = { widgetId: 'agenda' }

const MEETINGS = [
  { label: 'Stand-up', detail: '9:30' },
  { label: 'Design review', detail: '11:00' },
  { label: 'Release check', detail: '15:00', tone: 'needs-you' },
]

const OPEN_INBOX = { id: 'open-inbox', label: 'Open inbox', action: 'open-place', target: 'omniscio://inbox' }

function say(text) {
  statusEl.textContent = text
}

async function attempt(work, done) {
  try {
    await work()
    say(done)
  } catch (err) {
    say(`That did not work: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function showList() {
  return attempt(
    () => amc.widget.set({ shape: 'list', title: 'Today', icon: 'Calendar', items: MEETINGS, buttons: [OPEN_INBOX] }, AGENDA),
    'The agenda shows a list.'
  )
}

function showStat() {
  return attempt(
    () => amc.widget.set({ shape: 'stat', value: String(MEETINGS.length), label: 'meetings', icon: 'Calendar', buttons: [OPEN_INBOX] }, AGENDA),
    'The agenda shows a number.'
  )
}

function clearAgenda() {
  return attempt(() => amc.widget.clear(AGENDA), 'The agenda is cleared.')
}

async function openInbox() {
  try {
    const result = await amc.widget.action({ action: 'open-place', target: 'omniscio://inbox' })
    say(result.status === 'refused' ? result.message : `Omniscio answered: ${result.status}.`)
  } catch (err) {
    say(`That did not work: ${err instanceof Error ? err.message : String(err)}`)
  }
}

document.getElementById('btn-list').addEventListener('click', showList)
document.getElementById('btn-stat').addEventListener('click', showStat)
document.getElementById('btn-clear').addEventListener('click', clearAgenda)
document.getElementById('btn-inbox').addEventListener('click', openInbox)

if (amc?.widget?.set) void showList()
