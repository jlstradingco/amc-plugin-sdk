import type { AgentMC } from '@agent-mc/plugin-sdk/browser'
import type { Recording } from '@agent-mc/plugin-sdk'

const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC

const startBtn = document.getElementById('start-btn') as HTMLButtonElement
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement
const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement
const statusEl = document.getElementById('status') as HTMLDivElement
const recList = document.getElementById('rec-list') as HTMLUListElement

let activeRecordingId: string | null = null

/**
 * There is no `AgentMC.recording`.
 *
 * Screen recording is a BACKEND capability (`ctx.recording`). This UI therefore
 * asks its own backend to do the work over the shared event bus — an `emit`
 * from either surface reaches subscribers on both — and renders whatever the
 * backend publishes back. See ../backend/index.ts.
 */
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

function renderList(recordings: Recording[]): void {
  if (recordings.length === 0) {
    recList.innerHTML = '<li class="empty">No recordings yet.</li>'
    return
  }
  recList.innerHTML = recordings
    .map((rec) => {
      const seconds = Math.round(rec.durationMs / 1000)
      const ended = rec.endedAt ? new Date(rec.endedAt).toLocaleString() : 'in progress'
      return `<li class="item">
        <div class="title">${escapeHtml(rec.sourceLabel)} · ${escapeHtml(rec.status)}</div>
        <div class="body">${seconds}s · started ${escapeHtml(
          new Date(rec.startedAt).toLocaleString()
        )} · ${escapeHtml(ended)}</div>
      </li>`
    })
    .join('')
}

amc.events.on('recording:list', (data) => {
  const { recordings } = (data ?? {}) as { recordings?: Recording[] }
  renderList(recordings ?? [])
})

amc.events.on('recording:started', (data) => {
  const { recordingId } = (data ?? {}) as { recordingId?: string }
  activeRecordingId = recordingId ?? null
  startBtn.disabled = true
  stopBtn.disabled = false
  statusEl.textContent = `Recording (id: ${activeRecordingId ?? 'unknown'}).`
})

amc.events.on('recording:stopped', () => {
  activeRecordingId = null
  startBtn.disabled = false
  stopBtn.disabled = true
  statusEl.textContent = 'Stopped.'
})

amc.events.on('recording:error', (data) => {
  const { message } = (data ?? {}) as { message?: string }
  // The host REFUSES rather than throwing: the recorder may be disabled or
  // busy, or the user may have dismissed the native confirm that every start
  // requires. Treat this as an expected state, not a bug.
  activeRecordingId = null
  startBtn.disabled = false
  stopBtn.disabled = true
  statusEl.textContent = `Refused: ${message ?? 'unknown reason'}`
})

startBtn.addEventListener('click', () => {
  statusEl.textContent = 'Starting… (AMC will ask you to confirm)'
  amc.events.emit('recording:start', {})
})

stopBtn.addEventListener('click', () => {
  if (!activeRecordingId) return
  statusEl.textContent = 'Stopping…'
  amc.events.emit('recording:stop', { recordingId: activeRecordingId })
})

refreshBtn.addEventListener('click', () => amc.events.emit('recording:refresh', {}))

stopBtn.disabled = true
amc.events.emit('recording:refresh', {})
