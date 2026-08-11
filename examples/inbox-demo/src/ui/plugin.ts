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
        <div class="body">${escapeHtml(item.subtitle ?? '')}</div>
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

  // The host's inbox row is deliberately small: id, title, a REQUIRED ISO
  // timestamp it orders on, and two optional presentation fields. `body`,
  // `icon`, `priority`, `actionLabel` and `actionId` were in an earlier version
  // of this demo and none of them exist — sending them made the host drop the
  // whole batch silently, so this demo published nothing.
  //
  // The priority picker now drives `dotColor`, which is the real way to signal
  // urgency on an inbox row.
  const priority = prioritySelect.value
  items.push({
    id: `demo-${Date.now()}`,
    title,
    subtitle: bodyInput.value.trim() || undefined,
    dotColor: priority === 'high' ? '#ef4444' : priority === 'low' ? '#64748b' : undefined,
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
