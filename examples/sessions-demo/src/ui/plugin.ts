import type { AgentMC } from '@amc/plugin-sdk/browser'

const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC

const promptInput = document.getElementById('prompt') as HTMLInputElement
const askBtn = document.getElementById('ask-btn') as HTMLButtonElement
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement
const statusDot = document.getElementById('status-dot') as HTMLDivElement
const statusText = document.getElementById('status-text') as HTMLSpanElement
const messagesDiv = document.getElementById('messages') as HTMLDivElement

let currentSessionId: string | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

function setStatus(status: string) {
  statusDot.className = `status-dot status-${status}`
  statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1)

  const isActive = status === 'starting' || status === 'running'
  askBtn.disabled = isActive
  askBtn.style.display = isActive ? 'none' : ''
  stopBtn.style.display = isActive ? '' : 'none'
}

function renderMessages(messages: unknown[]) {
  if (messages.length === 0) {
    messagesDiv.innerHTML = '<div class="empty">Waiting for response...</div>'
    return
  }

  messagesDiv.innerHTML = messages
    .map((msg: unknown) => {
      const m = msg as { source?: string; text?: string; content?: string }
      const source = m.source ?? 'system'
      const text = m.text ?? m.content ?? ''
      const cls =
        source === 'operator' ? 'msg-operator' : source === 'agent' ? 'msg-agent' : 'msg-system'
      return `<div class="message ${cls}"><strong>${escapeHtml(source)}:</strong> ${escapeHtml(String(text))}</div>`
    })
    .join('')

  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

askBtn.addEventListener('click', async () => {
  const prompt = promptInput.value.trim()
  if (!prompt) return

  promptInput.value = ''
  messagesDiv.innerHTML = ''
  setStatus('starting')

  try {
    const result = await amc.session.create({ prompt })
    currentSessionId = result.sessionId

    setStatus('running')
    startPolling()
  } catch (err) {
    setStatus('error')
    messagesDiv.innerHTML = `<div class="message msg-system">Failed to create session: ${String(err)}</div>`
  }
})

stopBtn.addEventListener('click', async () => {
  if (!currentSessionId) return
  try {
    await amc.session.stop(currentSessionId)
    setStatus('ended')
    stopPolling()
  } catch (err) {
    console.error('Failed to stop session:', err)
  }
})

function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    if (!currentSessionId) return

    try {
      const status = await amc.session.getStatus(currentSessionId)
      const messages = await amc.session.getMessages(currentSessionId)
      renderMessages(messages)

      if (status === 'ended' || status === 'error' || status === 'archived') {
        setStatus(status === 'error' ? 'error' : 'ended')
        stopPolling()
      }
    } catch {
      // Session may not exist yet — keep polling
    }
  }, 1500)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
