# GitHub Issues

Full-stack AMC plugin that syncs and displays GitHub issues. Demonstrates backend lifecycle, cron scheduling, HTTP requests, settings, sidebar badges, and toasts.

## What It Shows

**Backend APIs:**

- `ctx.http.fetch()` — call GitHub REST API
- `ctx.db.insert()` / `.query()` / `.update()` — cache issues locally
- `ctx.cron.register()` — periodic sync every 15 minutes
- `ctx.settings.get()` — read configured repo + token
- `ctx.sidebar.setBadge()` — show open issue count
- `ctx.toast.show()` — notify on new issues
- `ctx.log.info()` / `.error()` — structured logging

**Frontend APIs:**

- `AgentMC.db.query()` — read cached issues
- `AgentMC.settings.get()` — display current repo

## Setup

1. Go to AMC → Settings → Plugins → GitHub Issues
2. Set **GitHub Repository** to `owner/repo`
3. Create a [Personal Access Token](https://github.com/settings/tokens) with `repo` scope
4. Paste the token into **Personal Access Token**
5. Issues sync automatically every 15 minutes

## Running in Dev Shell

```bash
cd examples/github-issues
npm install
npm run build
npm run dev
```

Note: The dev shell uses mock APIs — real GitHub sync requires installing in AMC.
