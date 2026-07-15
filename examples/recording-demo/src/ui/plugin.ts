import type { AgentMC } from '@agent-mc/plugin-sdk/browser'
import type { Recording, RecordingHandle } from '@agent-mc/plugin-sdk'

const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC

const startBtn = document.getElementById('start-btn') as HTMLButtonElement
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement
const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement
const statusEl = document.getElementById('status') as HTMLDivElement
const recList = document.getElementById('rec-list') as HTMLUListElement

let handle: RecordingHandle | null = null

// The recording bridge is not yet wired, so every call is wrapped: a rejection
// or absent bridge is reported as "not yet available" rather than crashing.
function reportUnavailable(action: string, err: unknown) {
  statusEl.textContent = `${action} — recording is not yet available in this build (${String(err)}).`
}

startBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Starting…'
  try {
    handle = await amc.recording.start({ source: 'screen' })
    startBtn.disabled = true
    stopBtn.disabled = false
    statusEl.textContent = `Recording (id: ${handle.recordingId}).`
  } catch (err) {
    reportUnavailable('Could not start', err)
  }
})

stopBtn.addEventListener('click', async () => {
  if (!handle) return
  statusEl.textContent = 'Stopping…'
  try {
    const { recordingId } = await amc.recording.stop(handle)
    statusEl.textContent = `Stopped (id: ${recordingId}).`
    handle = null
    startBtn.disabled = false
    stopBtn.disabled = true
    await refresh()
  } catch (err) {
    reportUnavailable('Could not stop', err)
  }
})

refreshBtn.addEventListener('click', refresh)

async function refresh() {
  try {
    const recordings = await amc.recording.list()
    renderList(recordings)
  } catch (err) {
    recList.innerHTML = '<li class="empty">Recording list is not yet available in this build.</li>'
    reportUnavailable('Could not list', err)
  }
}

async function renderList(recordings: Recording[]) {
  if (!recordings || recordings.length === 0) {
    recList.innerHTML = '<li class="empty">No recordings.</li>'
    return
  }

  recList.innerHTML = recordings
    .map(
      (r) => `
    <li class="rec">
      <strong>${escapeHtml(r.filename)}</strong><br />
      ${(r.durationMs / 1000).toFixed(1)}s · ${(r.sizeBytes / 1024).toFixed(0)} KB ·
      ${escapeHtml(r.createdAt)}
    </li>`
    )
    .join('')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

refresh()
