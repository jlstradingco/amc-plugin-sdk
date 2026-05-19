import type { AgentMC } from '@agent-mc/plugin-sdk/browser'

const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC

const buttons: Array<{
  id: string
  countId: string
  storageKey: string
  action: () => void
}> = [
  {
    id: 'btn-success',
    countId: 'count-success',
    storageKey: 'clicks_success',
    action: () => amc.toast.show({ type: 'success', message: 'Operation completed successfully!' })
  },
  {
    id: 'btn-error',
    countId: 'count-error',
    storageKey: 'clicks_error',
    action: () => amc.toast.show({ type: 'error', message: 'Something went wrong!' })
  },
  {
    id: 'btn-info',
    countId: 'count-info',
    storageKey: 'clicks_info',
    action: () => amc.toast.show({ type: 'info', message: 'FYI: this is informational' })
  },
  {
    id: 'btn-notify',
    countId: 'count-notify',
    storageKey: 'clicks_notify',
    action: () => amc.toast.notify({ title: 'Toasts Demo', body: 'This is a system notification' })
  }
]

async function init() {
  for (const btn of buttons) {
    const el = document.getElementById(btn.id)!
    const countEl = document.getElementById(btn.countId)!

    const stored = await amc.storage.get(btn.storageKey)
    let count = typeof stored === 'number' ? stored : 0
    countEl.textContent = `${count} click${count !== 1 ? 's' : ''}`

    el.addEventListener('click', async () => {
      btn.action()
      count++
      await amc.storage.set(btn.storageKey, count)
      countEl.textContent = `${count} click${count !== 1 ? 's' : ''}`
    })
  }
}

init()
