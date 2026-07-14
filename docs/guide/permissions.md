# Permissions

Plugins declare the permissions they need in `manifest.json`. AMC shows these to the user during installation and enforces them at runtime -- if your plugin calls an API it has not been granted permission for, the call is rejected.

## Permission Model

Permissions gate access to specific API surfaces. Some APIs are available to every plugin without any permission declaration. The full canonical list is exported at runtime as `PLUGIN_PERMISSIONS` from `@agent-mc/plugin-sdk`.

### Always Available (No Permission Needed)

These APIs are available to all plugins, regardless of permissions:

| API | Interface | What it does |
|---|---|---|
| **Settings** | `PluginSettings` | Read the plugin's own settings (`getAll()`, `get(key)`) |
| **Logging** | `PluginLogger` | Write to AMC's log (`info()`, `warn()`, `error()`, `debug()`) |
| **Events** | `PluginEvents` | Emit and listen for plugin-scoped events (`emit()`, `on()`) |
| **Sidebar** | `PluginSidebar` | Update the sidebar badge and item list (`setBadge()`, `setItems()`) |
| **Toast (show)** | `PluginToast.show()` | Display in-app toast messages (success, error, info) |

::: tip
Settings are read-only from the plugin's perspective. The user configures them through AMC's Settings > Plugins panel. Your plugin defines the available settings in `manifest.json` and reads their current values at runtime.
:::

## Permission Reference

### `storage`

**Grants access to:** `PluginStorage`, `PluginDb`, `PluginFs`

Three related APIs for persisting data:

**PluginStorage** -- simple key-value store:

```typescript
await ctx.storage.get('lastRun')           // Read a value
await ctx.storage.set('lastRun', Date.now()) // Write a value
await ctx.storage.delete('lastRun')        // Delete a value
await ctx.storage.list('config:')          // List keys with prefix
```

**PluginDb** -- structured database (SQLite collections defined in manifest):

```typescript
// Insert a row
const row = await ctx.db.insert('tasks', {
  title: 'Review PR',
  priority: 1,
})

// Query with filters, ordering, and pagination
const results = await ctx.db.query('tasks', {
  where: { priority: 1 },
  orderBy: 'created_at',
  order: 'DESC',
  limit: 10,
  offset: 0,
})

// Get, update, delete by ID
const task = await ctx.db.getById('tasks', 'abc-123')
await ctx.db.update('tasks', 'abc-123', { priority: 2 })
await ctx.db.delete('tasks', 'abc-123')
await ctx.db.deleteWhere('tasks', { priority: 0 })
```

**PluginFs** -- sandboxed filesystem within the plugin's data directory:

```typescript
await ctx.fs.writeFile('output/report.md', content)
const text = await ctx.fs.readFile('output/report.md')
const exists = await ctx.fs.exists('output/report.md')
const files = await ctx.fs.listDir('output')
await ctx.fs.deleteFile('output/report.md')
```

::: warning
All filesystem paths are relative to the plugin's data directory. Plugins cannot access files outside this sandbox.
:::

---

### `sessions`

**Grants access to:** `PluginSessions`

Create and manage Claude Code sessions programmatically:

```typescript
// Create a new session
const { sessionId } = await ctx.sessions.create({
  prompt: 'Analyze the codebase for security issues',
  projectId: 'optional-project-id',
})

// Interact with the session
await ctx.sessions.sendMessage(sessionId, 'Focus on SQL injection')
const status = await ctx.sessions.getStatus(sessionId)
const messages = await ctx.sessions.getMessages(sessionId)

// Monitor status changes
const unsubscribe = ctx.sessions.onStatusChange(sessionId, (status) => {
  ctx.log.info(`Session ${sessionId} is now: ${status}`)
})

// Stop the session
await ctx.sessions.stop(sessionId)
```

---

### `ai`

**Grants access to:** `PluginAi`

Call AI models directly for text generation without creating a full session:

```typescript
// Generate a response with a system prompt and user prompt
const response = await ctx.ai.generateMessage(
  'You are a helpful code reviewer.',
  'Review this function for potential bugs: ...',
)

// Generate a short title from text
const title = await ctx.ai.generateTitle(
  'This PR adds pagination to the user list endpoint...',
)
```

---

### `network`

**Grants access to:** `PluginHttp`

Make outbound HTTP requests:

```typescript
const response = await ctx.http.fetch('https://api.example.com/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'test' }),
})

const data = await response.json()
```

The `fetch` API follows the standard [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) interface.

---

### `cron`

**Grants access to:** `PluginCron`

Register and manage scheduled tasks:

```typescript
// Register a handler for a cron job declared in manifest.json
ctx.cron.register('heartbeat', '*/30 * * * *', async () => {
  ctx.log.info('Running heartbeat check')
  const status = await checkHealth()
  await ctx.db.insert('checks', { status, timestamp: Date.now() })
})

// Check if a job is registered
const active = ctx.cron.isRegistered('heartbeat')

// Unregister a job
ctx.cron.unregister('heartbeat')
```

::: tip
Cron jobs must also be declared in the `cron.jobs` array in `manifest.json`. The `id` you pass to `register()` must match a declared job ID. See [Manifest > Cron Block](./manifest#cron-block).
:::

---

### `cli`

**Grants access to:** `PluginCli`

Register HTTP endpoint handlers accessible through AMC's CLI control server:

```typescript
ctx.cli.handle('status', async (req) => {
  // req: { method, path, body?, query? }
  const checks = await ctx.db.query('checks', {
    orderBy: 'created_at',
    order: 'DESC',
    limit: 5,
  })

  return {
    status: 200,
    body: { healthy: true, recentChecks: checks },
  }
})

// Remove a handler
ctx.cli.removeHandler('status')
```

Endpoints are reached at `http://127.0.0.1:19519/plugins/<plugin-id>/<path>`.

::: tip
CLI endpoints must also be declared in the `cli.endpoints` array in `manifest.json`. The `path` you pass to `handle()` must match a declared endpoint path. See [Manifest > CLI Block](./manifest#cli-block).
:::

---

### `notifications`

**Grants access to:** `PluginToast.notify()`

Send OS-level desktop notifications (system tray notifications):

```typescript
ctx.toast.notify({
  title: 'Build Complete',
  body: 'Your project has been built successfully.',
})
```

Note that `ctx.toast.show()` (in-app toasts) is available without this permission. The `notifications` permission is only required for `ctx.toast.notify()`, which triggers a native OS notification.

### `rss`

**Grants access to:** AMC's built-in RSS feed data

Allows the plugin to read RSS feeds and articles managed by AMC's Channels system:

```typescript
// Fetch articles from a specific feed
const articles = await ctx.rss.getArticles({ feedId: 'abc-123', limit: 20 })

// Get all configured feeds
const feeds = await ctx.rss.getFeeds()
```

Plugins that source content from RSS feeds (e.g. newsletter builders, digest generators) should declare this permission.

---

### `system`

**Grants access to:** host shell / clipboard / process capabilities exposed through the UI bridge (`window.AgentMC`)

Covers privileged desktop actions surfaced to a plugin's webview UI — opening a path or revealing an item in the OS file manager, reading text/images from the clipboard, and launching or signalling child processes. Only declare it if your plugin's UI genuinely drives the host desktop.

---

### `chrome`

**Grants access to:** host chrome / navigation surfaces exposed through the UI bridge (toolbar items, context menus, in-app navigation)

Lets a plugin's UI integrate with AMC's own chrome — contributing toolbar/context-menu entries and navigating within the app shell.

---

### `recording`

**Grants access to:** `PluginRecording` (screen-recording control)

::: warning Bridge pending
The `recording` permission is recognized and described by the host, but the backend `ctx.recording` namespace is not yet wired — a call is currently inert. It is a tracked known-delta (see the SDK↔host parity guard) pending a future host release that connects the bridge.
:::

---

## Declaring Permissions

Add permissions to the `permissions` array in `manifest.json`:

```json
{
  "permissions": ["storage", "sessions", "ai", "network"]
}
```

Only request the permissions your plugin actually needs. Users see the permission list during installation, and requesting unnecessary permissions may discourage adoption.

## Summary Table

| Permission | APIs Granted | Use Case |
|---|---|---|
| `storage` | `PluginStorage`, `PluginDb`, `PluginFs` | Persist data, query collections, read/write files |
| `sessions` | `PluginSessions` | Create/manage Claude Code sessions |
| `ai` | `PluginAi` | Direct AI text generation |
| `network` | `PluginHttp` | Outbound HTTP requests |
| `cron` | `PluginCron` | Scheduled background tasks |
| `cli` | `PluginCli` | HTTP endpoints on AMC's control server |
| `notifications` | `PluginToast.notify()` | Native OS desktop notifications |
| `system` | Shell / clipboard / process (UI bridge) | Open paths, read clipboard, run child processes |
| `rss` | `PluginRss` | Read RSS feeds and articles from AMC's Channels |
| `auth` | `PluginAuth` (identity) | Read the signed-in user's identity + Google ID token |
| `auth.session` | `PluginAuth.getSession()` | Read the active auth session |
| `chrome` | Toolbar / context-menu / navigation (UI bridge) | Contribute chrome and navigate the app shell |
| `recording` | `PluginRecording` | Screen-recording control — recognized, but **the host bridge is not yet wired (calls are inert)** |
| `inbox` | `PluginInbox.setItems()` | Contribute rows to the AMC inbox |
| `navigation` | In-app navigation | Navigate the user within AMC |
| *(none)* | `PluginSettings`, `PluginLogger`, `PluginEvents`, `PluginSidebar`, `PluginToast.show()` | Always available |
