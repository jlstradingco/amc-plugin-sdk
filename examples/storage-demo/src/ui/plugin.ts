import type { AgentMC } from '@agent-mc/plugin-sdk/browser'

const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC

const titleInput = document.getElementById('title') as HTMLInputElement
const bodyInput = document.getElementById('body') as HTMLTextAreaElement
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement
const sortToggle = document.getElementById('sort-toggle') as HTMLInputElement
const noteList = document.getElementById('note-list') as HTMLUListElement
const countSpan = document.getElementById('count') as HTMLSpanElement

let newestFirst = false

async function loadPreferences() {
  const pref = await amc.storage.get('sortNewestFirst')
  newestFirst = pref === true
  sortToggle.checked = newestFirst
}

async function savePreferences() {
  await amc.storage.set('sortNewestFirst', newestFirst)
}

async function loadNotes() {
  const notes = await amc.db.query('notes', {
    orderBy: 'created_at',
    order: newestFirst ? 'DESC' : 'ASC'
  })

  countSpan.textContent = `${notes.length} note${notes.length !== 1 ? 's' : ''}`

  if (notes.length === 0) {
    noteList.innerHTML = '<li class="empty">No notes yet. Create one above!</li>'
    return
  }

  noteList.innerHTML = notes
    .map(
      (note) => `
    <li class="note-item" data-id="${note.id}">
      <div class="content">
        <div class="title">${escapeHtml(String(note.title))}</div>
        <div class="body">${escapeHtml(String(note.body))}</div>
      </div>
      <button class="btn-danger delete-btn">Delete</button>
    </li>
  `
    )
    .join('')

  noteList.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const li = btn.closest('.note-item') as HTMLElement
      const id = li.dataset.id!
      await amc.db.delete('notes', id)
      await loadNotes()
    })
  })
}

saveBtn.addEventListener('click', async () => {
  const title = titleInput.value.trim()
  const body = bodyInput.value.trim()
  if (!title) return

  await amc.db.insert('notes', { title, body })
  titleInput.value = ''
  bodyInput.value = ''
  await loadNotes()
})

sortToggle.addEventListener('change', async () => {
  newestFirst = sortToggle.checked
  await savePreferences()
  await loadNotes()
})

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

loadPreferences().then(() => loadNotes())
