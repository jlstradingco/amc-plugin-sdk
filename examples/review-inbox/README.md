# Review Inbox

Full-stack AMC plugin that surfaces GitHub pull requests awaiting your review directly in AMC's **Inbox**. Demonstrates the auth broker (`ctx.auth.getSession`), the Inbox API (`ctx.inbox.setItems`), cron scheduling, and HTTP requests — the newer 1.0.7 surface.

## What It Shows

**Backend APIs:**

- `ctx.auth.getSession('github', ['repo'], { createIfNone: true })` — request a short-lived, scoped GitHub token from AMC's auth broker (no PAT to configure)
- `ctx.http.fetch()` — query the GitHub search API with that token
- `ctx.inbox.setItems()` — surface review requests as high-priority inbox items (declarative full-replace)
- `ctx.db.query()` / `.insert()` / `.delete()` — cache the current set for the UI
- `ctx.cron.register()` — refresh every 10 minutes
- `ctx.sidebar.setBadge()` — show the pending-review count
- `ctx.storage.set()` — remember the last sync time

**Frontend APIs:**

- `AgentMC.db.query()` — read the cached reviews
- `AgentMC.storage.get()` — display the last sync time

## Permissions

`storage`, `network`, `cron`, `auth`, `auth.session`, `inbox`

The `auth.session` permission is what lets the plugin request a provider access token via `getSession()`. Unlike the [GitHub Issues](../github-issues) example, there's no Personal Access Token to paste — AMC brokers the token for you.

## Running in Dev Shell

```bash
cd examples/review-inbox
npm install
npm run build
npm run dev
```

Note: The dev shell uses mock APIs — real GitHub sync and inbox items require installing in AMC.
