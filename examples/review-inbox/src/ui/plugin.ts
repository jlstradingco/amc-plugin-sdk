import type { AgentMC } from '@agent-mc/plugin-sdk/browser'

const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC

const reviewList = document.getElementById('review-list') as HTMLUListElement
const lastSyncLabel = document.getElementById('last-sync') as HTMLParagraphElement
const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function loadReviews() {
  const reviews = await amc.db.query('reviews', {
    orderBy: 'updated_at',
    order: 'DESC'
  })

  const lastSync = await amc.storage.get('lastSync')
  lastSyncLabel.textContent = lastSync
    ? `Last synced ${new Date(String(lastSync)).toLocaleString()}`
    : 'Pull requests awaiting your review'

  if (reviews.length === 0) {
    reviewList.innerHTML = '<li class="empty">Nothing awaiting your review</li>'
    return
  }

  reviewList.innerHTML = reviews
    .map(
      (r) => `
      <li class="review-item">
        <div class="review-content">
          <div class="review-title">${escapeHtml(String(r.title))}</div>
          <div class="review-meta">
            <span class="repo-badge">${escapeHtml(String(r.repo))} #${r.number}</span>
            ${r.author ? `<span>@${escapeHtml(String(r.author))}</span>` : ''}
          </div>
        </div>
      </li>
    `
    )
    .join('')
}

refreshBtn.addEventListener('click', () => {
  amc.toast.show({ type: 'info', message: 'Reloading cached reviews…' })
  loadReviews()
})

loadReviews()
