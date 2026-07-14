import type { PluginActivate, PluginContext } from '@agent-mc/plugin-sdk'

const SYNC_JOB = 'sync-reviews'

interface SearchResult {
  items: Array<{
    number: number
    title: string
    html_url: string
    repository_url: string
    user: { login: string } | null
    updated_at: string
  }>
}

// https://api.github.com/repos/owner/name -> owner/name
function repoFromUrl(repositoryUrl: string): string {
  const marker = '/repos/'
  const i = repositoryUrl.indexOf(marker)
  return i >= 0 ? repositoryUrl.slice(i + marker.length) : repositoryUrl
}

async function syncReviews(ctx: PluginContext): Promise<void> {
  // Ask AMC's auth broker for a short-lived GitHub token, scoped to reading
  // repos. `createIfNone` starts an interactive sign-in if there's no session.
  const session = await ctx.auth.getSession('github', ['repo'], { createIfNone: true })
  if (!session) {
    ctx.log.warn('No GitHub session — sign in to sync review requests')
    return
  }

  const res = await ctx.http.fetch(
    'https://api.github.com/search/issues?q=is:open+is:pr+review-requested:@me&per_page=50',
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'amc-review-inbox-plugin'
      }
    }
  )

  if (!res.ok) {
    ctx.log.error(`GitHub search failed: ${res.status} ${res.statusText}`)
    return
  }

  const data = (await res.json()) as SearchResult
  const prs = data.items ?? []

  // Replace the cached set the UI reads from.
  const existing = await ctx.db.query('reviews')
  for (const row of existing) await ctx.db.delete('reviews', String(row.id))
  for (const pr of prs) {
    await ctx.db.insert('reviews', {
      number: pr.number,
      title: pr.title,
      repo: repoFromUrl(pr.repository_url),
      url: pr.html_url,
      author: pr.user?.login ?? '',
      updated_at: pr.updated_at
    })
  }

  // Surface the same set in AMC's Inbox. `setItems` is a declarative
  // full-replace of this plugin's items, so stale reviews drop off.
  await ctx.inbox.setItems(
    prs.map((pr) => {
      const repo = repoFromUrl(pr.repository_url)
      return {
        id: `review-${repo}-${pr.number}`,
        title: `Review requested: ${pr.title}`,
        body: `${repo} #${pr.number} · @${pr.user?.login ?? 'unknown'}`,
        icon: 'git-pull-request',
        priority: 'high' as const,
        actionLabel: 'Open PR',
        actionId: pr.html_url,
        timestamp: pr.updated_at
      }
    })
  )

  ctx.sidebar.setBadge(prs.length)
  await ctx.storage.set('lastSync', new Date().toISOString())
  ctx.log.info(`Synced ${prs.length} review request(s)`)
}

const activate: PluginActivate = (ctx) => {
  return {
    async onEnable() {
      ctx.log.info('Review Inbox enabled')
      ctx.cron.register(SYNC_JOB, '*/10 * * * *', async () => {
        await syncReviews(ctx)
      })
      await syncReviews(ctx)
    },

    async onDisable() {
      ctx.cron.unregister(SYNC_JOB)
      await ctx.inbox.setItems([])
      ctx.log.info('Review Inbox disabled')
    }
  }
}

export default activate
