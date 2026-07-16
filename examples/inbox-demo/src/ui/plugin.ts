import type { AgentMC } from '@agent-mc/plugin-sdk/browser'
import type { InboxItem } from '@agent-mc/plugin-sdk'

const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC

const titleInput = document.getElementById('title') as HTMLInputElement
const bodyInput = document.getElementById('body') as HTMLInputElement
const prioritySelect = document.getElementById('priority') as HTMLSelectElement
const addBtn = document.getElementById('add-btn') as HTMLButtonElement
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement
const itemList = document.getElementById('item-list') as HTMLUListElement
const countEl = document.getElementById('count') as HTMLDivElement

const STORAGE_KEY = 'inbox_items'

// The working list. setItems() is a full replace, so we keep the array here,
// mutate it, and re-publish the whole thing after every change.
let items: InboxItem[] = []

async function publish() {
  await amc.inbox.setItems(items)
  await amc.storage.set(STORAGE_KEY, items)
  render()
}

function render() {
  countEl.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`

  if (items.length === 0) {
    itemList.innerHTML = '<li class="empty">No items. Add one above — it appears in the AMC inbox.</li>'
    return
  }

  itemList.innerHTML = items
    .map(
      (item) => `
    <li class="item" data-id="${escapeHtml(item.id)}">
      <div>
        <div class="title">${escapeHtml(item.title)}</div>
        <div class="body">${escapeHtml(item.body ?? '')} · ${escapeHtml(item.priority ?? 'normal')}</div>
      </div>
      <button class="btn-danger remove-btn">Remove</button>
    </li>`
    )
    .join('')

  itemList.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const li = btn.closest('.item') as HTMLElement
      const id = li.dataset.id!
      items = items.filter((i) => i.id !== id)
      await publish()
    })
  })
}

addBtn.addEventListener('click', async () => {
  const title = titleInput.value.trim()
  if (!title) return

  const priority = prioritySelect.value as InboxItem['priority']
  items.push({
    id: `demo-${Date.now()}`,
    title,
    body: bodyInput.value.trim() || undefined,
    icon: 'inbox',
    priority,
    actionLabel: 'Open Inbox Demo',
    actionId: 'open',
    timestamp: new Date().toISOString()
  })

  titleInput.value = ''
  bodyInput.value = ''
  await publish()
})

clearBtn.addEventListener('click', async () => {
  items = []
  await publish()
})

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function init() {
  const stored = await amc.storage.get(STORAGE_KEY)
  items = Array.isArray(stored) ? (stored as InboxItem[]) : []
  render()
}

init()
