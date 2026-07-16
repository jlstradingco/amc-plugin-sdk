import type { AgentMC } from '@agent-mc/plugin-sdk/browser'

const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC

const issueList = document.getElementById('issue-list') as HTMLUListElement
const searchInput = document.getElementById('search') as HTMLInputElement
const repoLabel = document.getElementById('repo-label') as HTMLParagraphElement
const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement
const filterBtns = document.querySelectorAll('.filter-btn') as NodeListOf<HTMLButtonElement>

let currentFilter = 'open'
let currentSearch = ''

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function parseLabels(raw: unknown): string[] {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return [] }
  }
  if (Array.isArray(raw)) return raw.map(String)
  return []
}

async function loadIssues() {
  const whereClause: Record<string, unknown> = {}
  if (currentFilter !== 'all') {
    whereClause.state = currentFilter
  }

  const issues = await amc.db.query('issues', {
    where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
    orderBy: { github_updated_at: 'desc' }
  })

  const filtered = currentSearch
    ? issues.filter(
        (i) =>
          String(i.title).toLowerCase().includes(currentSearch) ||
          String(i.number).includes(currentSearch)
      )
    : issues

  if (filtered.length === 0) {
    issueList.innerHTML = '<li class="empty">No issues found</li>'
    return
  }

  issueList.innerHTML = filtered
    .map((issue) => {
      const labels = parseLabels(issue.labels)
      const labelHtml = labels.map((l) => `<span class="label">${escapeHtml(l)}</span>`).join(' ')
      const state = String(issue.state)
      const stateCls = state === 'open' ? 'state-open' : 'state-closed'

      return `
      <li class="issue-item">
        <span class="issue-number">#${issue.number}</span>
        <div class="issue-content">
          <div class="issue-title">${escapeHtml(String(issue.title))}</div>
          <div class="issue-meta">
            <span class="state-badge ${stateCls}">${state}</span>
            ${issue.assignee ? `<span>@${escapeHtml(String(issue.assignee))}</span>` : ''}
            ${labelHtml}
          </div>
        </div>
      </li>
    `
    })
    .join('')
}

filterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    filterBtns.forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    currentFilter = btn.dataset.filter ?? 'open'
    loadIssues()
  })
})

searchInput.addEventListener('input', () => {
  currentSearch = searchInput.value.trim().toLowerCase()
  loadIssues()
})

refreshBtn.addEventListener('click', () => {
  amc.toast.show({ type: 'info', message: 'Refreshing issues...' })
  loadIssues()
})

async function init() {
  const repo = await amc.settings.get('repo')
  if (repo) {
    repoLabel.textContent = String(repo)
  }
  await loadIssues()
}

init()
