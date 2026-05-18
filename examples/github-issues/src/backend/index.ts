import type { PluginActivate, PluginContext } from '@amc/plugin-sdk'

interface GitHubIssue {
  number: number
  title: string
  state: string
  labels: Array<{ name: string }>
  assignee: { login: string } | null
  body: string | null
  updated_at: string
}

async function syncIssues(ctx: PluginContext): Promise<void> {
  const repo = (await ctx.settings.get('repo')) as string
  const token = (await ctx.settings.get('githubToken')) as string

  if (!repo || !token) {
    ctx.log.warn('Skipping sync — repo or token not configured')
    return
  }

  ctx.log.info(`Syncing issues for ${repo}`)

  const res = await ctx.http.fetch(
    `https://api.github.com/repos/${repo}/issues?state=all&per_page=100&sort=updated`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'amc-github-issues-plugin'
      }
    }
  )

  if (!res.ok) {
    ctx.log.error(`GitHub API error: ${res.status} ${res.statusText}`)
    return
  }

  const issues = (await res.json()) as GitHubIssue[]
  let newCount = 0

  for (const issue of issues) {
    const existing = await ctx.db.query('issues', {
      where: { number: issue.number }
    })

    const data = {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      labels: JSON.stringify(issue.labels.map((l) => l.name)),
      assignee: issue.assignee?.login ?? '',
      body: (issue.body ?? '').slice(0, 1000),
      github_updated_at: issue.updated_at
    }

    if (existing.length > 0) {
      await ctx.db.update('issues', String(existing[0].id), data)
    } else {
      await ctx.db.insert('issues', data)
      newCount++
    }
  }

  const openIssues = await ctx.db.query('issues', { where: { state: 'open' } })
  ctx.sidebar.setBadge(openIssues.length)

  if (newCount > 0) {
    ctx.toast.show({
      type: 'info',
      message: `Found ${newCount} new issue${newCount !== 1 ? 's' : ''} in ${repo}`
    })
  }

  ctx.log.info(`Sync complete: ${issues.length} issues (${newCount} new)`)
}

const activate: PluginActivate = (ctx) => {
  return {
    async onEnable() {
      ctx.log.info('GitHub Issues plugin enabled')

      ctx.cron.register('sync-issues', '*/15 * * * *', async () => {
        await syncIssues(ctx)
      })

      await syncIssues(ctx)
    },

    onDisable() {
      ctx.cron.unregister('sync-issues')
      ctx.log.info('GitHub Issues plugin disabled')
    },

    async onSettingsChanged() {
      ctx.log.info('Settings changed — re-syncing')
      await syncIssues(ctx)
    }
  }
}

export default activate
