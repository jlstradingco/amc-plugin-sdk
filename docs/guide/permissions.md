# Permissions

Plugins declare the permissions they need in `manifest.json`. Omniscio shows these to the user during installation and enforces them at runtime -- if your plugin calls an API it has not been granted permission for, the call is rejected.

## Permission Model

Permissions gate access to specific API surfaces. Some APIs are available to every plugin without any permission declaration. The full canonical list is exported at runtime as `PLUGIN_PERMISSIONS` from `@omniscio/plugin-sdk`.

### Always Available (No Permission Needed)

These APIs are available to all plugins, regardless of permissions:

| API | Interface | What it does |
|---|---|---|
| **Settings** | `PluginSettings` | Read the plugin's own settings (`getAll()`, `get(key)`) |
| **Logging** | `PluginLogger` | Write to Omniscio's log (`info()`, `warn()`, `error()`, `debug()`) |
| **Events** | `PluginEvents` | Emit and listen for plugin-scoped events (`emit()`, `on()`) |
| **Sidebar** | `PluginSidebar` | Update the sidebar badge and item list (`setBadge()`, `setItems()`) |
| **Toast (show)** | `PluginToast.show()` | Display in-app toast messages (success, error, info) |

::: tip
Settings are read-only from the plugin's perspective. The user configures them through Omniscio's Settings > Plugins panel. Your plugin defines the available settings in `manifest.json` and reads their current values at runtime.
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
  orderBy: { created_at: 'desc' },
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

### `secrets`

**Grants access to:** `PluginSecrets`

Store and read your plugin's own credentials -- API keys, database passwords, access tokens --
encrypted by the operating system's keychain (macOS Keychain, Windows DPAPI, libsecret).

```typescript
await ctx.secrets.set('db-password', password)
const password = await ctx.secrets.get('db-password')   // string | null
const keys = await ctx.secrets.list()                    // keys only, never values
await ctx.secrets.delete('db-password')
```

Separate from `storage`, and deliberately so: secrets live in their own table, so a plugin
granted `storage` but not `secrets` cannot read your values or even enumerate their keys.

::: warning
`set` **throws** on a machine with no available keyring rather than falling back to a plaintext
write, and `get` returns `null` for both "never set" and "no longer decryptable". See
[the Secrets API](/api/secrets) before you rely on either.
:::

---

### `sessions`

**Grants access to:** `PluginSessions`

Create and manage Claude Code sessions programmatically:

```typescript
// Create a new session on your plugin's own virtual project.
// There is no `projectId` option -- the host always derives the project from
// your plugin ID. See the Sessions API reference.
const { sessionId } = await ctx.sessions.create({
  prompt: 'Analyze the codebase for security issues',
  userInitiated: true,
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

// File it away once you are done with it
await ctx.sessions.archive(sessionId)
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
Cron jobs are registered at runtime from your plugin's `activate()` — there is no manifest block for them. The `id` you pass to `register()` is yours to choose and must be unique within your plugin. The `cron` PERMISSION, though, must be in `manifest.json`'s `permissions` array.
:::

---

### `cli`

**Grants access to:** `PluginCli`

Register HTTP endpoint handlers accessible through Omniscio's CLI control server:

```typescript
ctx.cli.handle('status', async (req) => {
  // req: { method, path, body?, query? }
  const checks = await ctx.db.query('checks', {
    orderBy: { created_at: 'desc' },
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

**Grants access to:** Omniscio's built-in RSS feed data

Allows the plugin to read RSS feeds and articles managed by Omniscio's Channels system:

```typescript
const feed = await ctx.rss.fetchFeed('https://example.com/feed.xml')
const feeds = await ctx.rss.listFeeds()
const entries = await ctx.rss.getRecentEntries({ sinceDays: 7, feedId: 'abc-123', limit: 20 })
```

- `fetchFeed(url)` fetches and parses one feed URL (SSRF-checked) → `{ title, description?, link?, entries: [{ id, title, link?, content?, contentSnippet?, pubDate?, author?, categories? }] }`.
- `listFeeds()` returns the user's configured feeds → `{ id, url, name, lastFetchedAt, lastEntryAt, unreadCount, refreshIntervalMin, errorMessage, createdAt }`.
- `getRecentEntries({ sinceDays?, feedId?, limit? })` returns recent parsed entries from the local store, defaulting to the last 7 days and narrowing to one feed when `feedId` is given → `{ id, feedId, guid, title, link, content, author, publishedAt, isRead, isArchived, createdAt, fetchedContent, aiSummary, wasClicked, readDurationMs }`.

The namespace is read-only: there are no feed mutators.

Plugins that source content from RSS feeds (e.g. newsletter builders, digest generators) should declare this permission. Full reference: [RSS](../api/rss).

---

### `system`

**Grants access to:** the host's checked launcher, plus clipboard and file-opening through the UI bridge (`window.Omniscio`)

Covers privileged desktop actions surfaced to a plugin's webview UI: opening a path or revealing an item in the OS file manager, reading text and images from the clipboard, and asking Omniscio to run a program through its own launcher (`ctx.process` from a backend, `window.Omniscio.process` from your UI). Only declare it if your plugin genuinely drives the host desktop.

**Your backend asks the launcher to run a program.** A plugin's worker is forked under Node's `--permission` model without `--allow-child-process`, so `child_process` does not work there — a `spawn` / `exec` / `execSync` / `fork` call is refused with "A plugin cannot start programs by itself. Ask Omniscio to run the program through ctx.process.spawn or ctx.process.exec, which check the command first." That is deliberate: a process your backend starts itself inherits nothing of the sandbox, so it could read the user's own credentials. Call `ctx.process.exec(command, args, opts)` for a run-to-completion result, or `ctx.process.spawn(command, args, opts)` with `ctx.process.onOutput` / `ctx.process.onExit` and `ctx.process.kill(processId)` for a long run. The command is a bare name from `process.allowedCommands` or `process.pinnedPrograms` (see the manifest guide); the working directory is always your data folder, so pass absolute paths (a `cwd` option is refused). For commands inside a project the user granted, `ctx.workspace.exec` is still the road.

---

### `chrome`

**Grants access to:** host chrome / navigation surfaces exposed through the UI bridge (toolbar items, context menus, in-app navigation)

Lets a plugin's UI integrate with Omniscio's own chrome — contributing toolbar/context-menu entries and navigating within the app shell.

---

### `inbox`

**Grants access to:** `PluginInbox`

Surface items in Omniscio's inbox -- the unified list where the user reviews things that need their attention:

```typescript
await ctx.inbox.setItems([
  { id: 'scan-report', title: 'Security scan finished', priority: 'high' },
])
```

See the [Inbox API](../api/inbox) for the full `InboxItem` shape.

---

### `auth`

**Grants access to:** `PluginAuth` identity methods, plus `AgentMC.auth.getWebAuth()` (**webview**)

This is a Tier-1 **elevated** permission, and the consent card says so. Besides seeing who is signed in, it lets your panel call `AgentMC.auth.getWebAuth()`, which hands the plugin a real sign-in credential for the person's account. A plugin holding it can read and send Team Chat messages as that person, and the sign-in keeps working after Omniscio closes.

See who is signed in (name and email) and react to sign-in state:

```typescript
const user = await ctx.auth.getUser()
const signedIn = await ctx.auth.isAuthenticated()
```

This covers `getUser()`, `isAuthenticated()`, `getGoogleIdToken()`, `onAuthStateChange()`, and `requestSignIn()`. See the [Auth API](../api/auth).

---

### `auth.session`

**Grants access to:** `PluginAuth.getSession()`

Request scoped OAuth access tokens for Google and GitHub on the user's behalf, so your plugin can call those providers' APIs as the user:

```typescript
const session = await ctx.auth.getSession('google', [
  'https://www.googleapis.com/auth/calendar.readonly',
])
```

This is a distinct, higher-trust permission from `auth`. Declare it only if you need to act against a provider's API; declare `network` too if you call that API via `ctx.http.fetch`.

---

### `auth.actAsUser`

**Grants access to:** `AgentMC.auth.getWebAuth()` (webview only)

Sign in to the shared account Omniscio's Team Chat lives in as the signed-in person, so your webview
can use the Firebase Web SDK without running its own sign-in flow:

```typescript
const { config, customToken } = await AgentMC.auth.getWebAuth()
// firebase.initializeApp(config); await signInWithCustomToken(auth, customToken)
```

This is **elevated** and separate from `auth` on purpose. The custom token carries the person's own
identity, so it reads and writes everything that account can reach -- Team Chat channels and direct
messages included -- and it lasts as long as the sign-in does. `auth` alone only reveals who is
signed in and never mints a token. Declare `auth.actAsUser` only in a plugin that genuinely needs to
sign in as the person, and say so in your listing so the consent screen's warning makes sense.

---

### `navigation`

**Grants:** the ability to navigate Omniscio to your sessions, projects, and views

The `navigation` permission lets a plugin ask Omniscio to move the user to a session, project, or view. There is no `ctx.navigation` API in the current SDK surface -- navigation is host-gated and requested through the host bridge. Declare `navigation` so a plugin that drives Omniscio's navigation installs cleanly and is recognized at runtime.

---

### `recording`

**Grants access to:** `PluginRecording` (screen-recording control)

Start and stop screen recordings and manage the resulting files.

::: warning Bridge pending
`ctx.recording` is fully wired and Tier-1 **elevated**: `start()` / `stop()` / `list()` / `get()` are real, every `start` raises a native confirm the plugin cannot bypass, and the host redacts file paths and share tokens from everything the plugin can see. (This section previously said the bridge was "not yet wired" and that calls were inert — that stopped being true before 2026-08-11.) There is no webview equivalent: `Omniscio.recording` does not exist. See the [Recording API](../api/recording).
:::

---

### `network.upload`

**Grants access to:** `Omniscio.http.uploadFile` (plugin panel only)

Upload a file the person shared with your plugin to a website your manifest lists in `uploadHosts`. Tier-1 **elevated**, and it must be declared together with `uploadHosts` (either one alone is refused at install). Omniscio sends the file itself over https, asks the person to approve your list of sites once, follows no redirect, and forgets the approval when your plugin is turned off. See the [HTTP API](../api/http#uploading-a-file-the-person-shared-agentmc-http-uploadfile).

---

### `email.send`

**Grants access to:** `PluginEmail` (`ctx.email.send`, `ctx.email.sender`, backend only)

Send one email per call from the user's agent address. Tier-1 **elevated**: the host picks the
sender, always adds a one-click unsubscribe, cleans the HTML, never mails anyone who unsubscribed or
bounced, and holds each plugin to a burst of 10 and 500 a day. Every outcome is a typed result, never
a parsed message. There is no webview equivalent. See the [Email API](../api/email).

---

### `email.fromName`

**Grants access to:** the optional `fromName` field of `ctx.email.send` (backend only)

Put a display name beside the user's agent address, like "Weekly Digest". Tier-1 **elevated**, and it
must be declared together with `email.send` (alone it is refused at install). The address never
changes; the host strips quotes, angle brackets, `@` and address-like words, caps the name at 64
characters, and refuses a name that reads as the app's own. See the
[Email API](../api/email#fromname).

---

### `tts`

**Grants access to:** `PluginTts` (text-to-speech)

Read text aloud using whichever voice the user configured in Omniscio. `isAvailable()` reports false when the user has TTS turned off or has set up no voice provider — check it before offering a read-aloud control.

::: warning Metered spend
Synthesis costs real money and is billed to the user. Omniscio enforces its own per-plugin daily cap (shared with the `ai` capability) and `synthesize()` **rejects** once that cap is hit. Treat the rejection as an expected runtime state, not a bug — surface it to the user rather than retrying.
:::

See the [Text to Speech API](../api/tts).

---

### `sessions.images`

**Grants access to:** `ctx.sessions.sendMessage(sessionId, text, { images })` (backend), and `images` on `Omniscio.session.sendMessage` (panel)

Send pictures to one of your own AI sessions so the AI can look at them. Declare it **together with `sessions`**: a manifest that lists `sessions.images` without `sessions` is refused at install.

Pictures reach **only a session that has no tools**: any session of a plugin that did not declare `sessionTools`, hidden or visible, except a web (`access: 'web'`) session. A session that can use tools refuses them with `IMAGES_REQUIRE_TOOLLESS_SESSION`, so a picture can never carry instructions to something that could act on them.

- Each picture is `{ data, mimeType }`, and the message **text is still required**: pictures with empty text are refused (`INVALID_IMAGES` on the backend, a plain `Message text is required` on the panel).
- 1 to 4 pictures per message; `image/png`, `image/jpeg`, `image/webp` or `image/gif`, as bare base64 whose bytes really are that type.
- At most 2 MB per picture and 6 MB per message (measured on the encoded text), and at most 2000 px on each side.
- One session accepts at most 20 pictures or 16 MB encoded over its whole life; after that, `IMAGES_SESSION_LIMIT` says to start a fresh session. Picture sends to one session are handled one at a time, so two sent together cannot both slip under the limit.
- The session's model must be able to see pictures, or you get `ENGINE_CANNOT_SEE_IMAGES`.
- Any other picture that breaks a rule is refused with `INVALID_IMAGES`, and the message names the reason. Each of these codes leads the error message.
- Sending pictures without the `sessions.images` permission is a plain permission error, with no picture code.
- Pictures are never stored in the session's transcript: the stored message reads like `[2 images] your text`.

---

### `ai.images`

**Grants access to:** `AgentMC.ai.estimateImage` and `AgentMC.ai.generateImage` (**panel only**)

Make pictures with Image Studio, paid from the user's own Omniscio credit. It is a separate, **elevated** permission: holding `ai` grants nothing here, and you do not need `ai` to use it.

- One picture per request. The worker backend is refused.
- Omniscio prices the picture with its own estimate (its service fee included) and shows the user its own confirmation before every spend. Only the user's **Generate** spends; a cancel, a close or a two-minute wait makes nothing and charges nothing. You cannot pass a price.
- Each plugin has its own daily picture limit on the user's computer, $2 unless the user changes it in Cost Control.
- A refusal resolves `{ ok: false, code, message }` instead of rejecting — see the [AI API](../api/ai).
- Check `AgentMC.host.getCapabilities()` for `ai-images` before you offer a picture button.

---

### `sessions.readHistory`

**Grants access to:** `PluginSessionHistory` (read past sessions and projects)

Read the user's **existing** Omniscio sessions and projects — distinct from `sessions`, which creates and drives new ones. Intended for plugins that turn prior work into a summary, a deck, or a report.

This is the most privacy-sensitive permission in the SDK, and it is default-deny at runtime:

- The plugin sees **nothing** until it calls `requestAccess()`, which opens a picker where the user chooses exactly which projects or sessions to hand over. `getMessages()` on anything else **throws**.
- Content is **text only**. Tool calls, tool output, and file contents are stripped by the host before the plugin sees them, so secrets embedded in tool blocks never travel.
- Every read is written to an audit log the plugin cannot touch, and the user can revoke the grant at any time from Settings → Plugins.

Handle a cancelled grant (`result.cancelled === true`) as a normal outcome — declining is the expected default.

See the [Session History API](../api/session-history).

---

### `firebase`

**Grants access to:** `PluginFirebase` (enumerate Firebase accounts and projects)

List the Firebase accounts the user is signed into, list their projects, and start an interactive `firebase login`. Backed by the user's locally installed Firebase CLI.

::: tip Empty, never thrown
Every list method resolves to an **empty array** when the CLI is missing, times out, or returns something unparseable — none of them reject. So an empty result does not mean "no projects". Call `setupStatus()` to tell a genuinely empty account apart from a machine with no Firebase CLI, and branch on `cliInstalled` / `signedIn` before showing an empty state.
:::

See the [Firebase API](../api/firebase).

---

### `spend`

**Grants access to:** `PluginSpend` (read-only AI cost and usage totals)

Read the user's AI spend breakdown — headline totals for yesterday, the last 7 days, and the last 30 days, plus per-engine coding lines, per-feature background lines, and notable individual charges. This is what a spend-report plugin is built on.

Read-only, and there is nothing to pass: the host resolves the time windows and the user's timezone itself, so there is no window to widen. Note that the numbers are the user's **global** spend across all their accounts, not a slice scoped to your plugin.

`codingValue` is a shadow figure — what the agent-coding work would have cost at API rates, though it is covered by the flat plan. `outOfPocket` is the money actually spent. Do not present the two as the same thing.

See the [Spend API](../api/spend).

---

### `boards.read`

**Grants access to:** the webview's `Omniscio.boards` namespace — `requestAccess()` and `list()` — and, from the plugin's background program, `ctx.boards` reads: `list`, `getBoard` and `listItems`

Read the full contents of the boards the person grants your plugin: every item, column value and
status. The person chooses which boards — `requestAccess()` asks them — and nothing is shared until
they do. Reading board content from the background program is available when the person has turned
on Plugin access to boards and tasks in Labs.

Accepted by the SDK since 3.2.0, so a manifest declaring it passes `omniscio-plugin validate` and
preflight. Typed since 3.4.0 — see [Boards](../api/boards).

Standard tier: it only reads.

---

### `chrome.widget`

**Grants access to:** `Omniscio.widget` (a live status widget in the Omniscio titlebar -- **webview** only)

Draw one small widget in the app's titlebar: a number, a short label and a status tone that your plugin can update at any time. You describe it with data and Omniscio draws it, so a plugin cannot paint its own pixels in the highest-trust part of the app. The text caps (8 and 16 characters) exist so a plugin cannot imitate a system message there, and you pick a tone's **meaning** rather than a colour.

`chrome.widget` **requires an explicit `chrome`** in the same manifest. A manifest with `chrome.widget` alone is rejected by Omniscio and by `omniscio-plugin validate`; the host will not infer one permission from the other, so the consent card the user reads matches what the plugin holds.

```json
{
  "permissions": ["chrome", "chrome.widget"],
  "ui": { "entryPoint": "ui/index.html", "widget": { "entryPoint": "ui/widget.html" } }
}
```

There is no `ctx.widget`: the host builds none for backends. See the [Widget API](../api/widget).

---

### `coreRead`

**Grants access to:** `PluginCore` (`ctx.core`, **backend** only)

Read the user's sessions, projects and the text of their messages. This is an **elevated** permission and a **blanket** read: it covers everything the user has, not a session or project they picked. Omniscio describes it to the user as "Read your sessions, projects, and the text of their messages (never their secrets)".

```typescript
const core = ctx.core // optional, like ctx.rpc and ctx.host: check before use
if (!core) throw new Error('This plugin needs ctx.core (the coreRead permission).')
const projects = await core.projects.list()
const sessions = await core.sessions.list({ projectId: projects[0].id })
const messages = await core.messages.list(sessions[0].id, 20) // at most 200
```

Prefer [`sessions.readHistory`](#sessions-readhistory) when you only need history the user chose to hand over: that one is opt-in per session, and `coreRead` is not. See the [Core API](../api/core).

---

### `webassembly`

**Grants:** WebAssembly compilation in your plugin's own panel (**webview** only; no `ctx` or `Omniscio` namespace)

By default a plugin panel cannot compile WebAssembly: `WebAssembly.instantiate()` and friends throw a `CompileError`. Declaring `webassembly` lets your panel, and the workers it starts, compile and run WebAssembly, for example an ONNX or WebGPU runtime that processes video on the graphics card. This is an **elevated** permission: Omniscio lists it on the install card as "Run fast compiled code (WebAssembly) inside its own panel, for example to process video on your graphics card. It still cannot turn text into code." and the person approves it once.

What it changes, exactly: the panel's script policy gains `'wasm-unsafe-eval'` and nothing else. It never grants `'unsafe-eval'`, so `eval()`, `new Function()` and string timers stay blocked. Other plugins are unaffected, and so are your plugin's `@data` files and SVG assets, which keep their script-free policies.

```html
<!-- Only if your panel ships its own CSP meta tag: it must allow wasm too, because policies combine. -->
<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'wasm-unsafe-eval'">
```

```typescript
const module = await WebAssembly.compileStreaming(fetch('./model.wasm'))
const instance = await WebAssembly.instantiate(module, {})
```

The grant follows the person's approval, not the manifest alone: until they approve it, or if an update adds `webassembly` and they have not yet re-approved, the panel is served without it.

---

### `stt`

**Grants access to:** `Omniscio.stt` (**webview** only — `transcribe`, `isConfigured`)

Turn speech into text with the person's configured speech service. `transcribe(audioBase64, opts?)`
takes audio your panel recorded and resolves the transcript; `isConfigured()` tells you whether a
speech provider is set up at all, so you can hide a microphone control instead of failing on click.
Metered against the person's allowance.

---

### `microphone`

**Grants access to:** the panel's `navigator.mediaDevices.getUserMedia({ audio: true })` (**webview** only)

Without it, a plugin panel's request for the microphone is refused by Omniscio's media-permission
guard, even in a Chromium context that would otherwise allow it. This is an **elevated** permission:
it is a live microphone any time the panel is open, so declare it only for a plugin that records —
and say in your UI when recording starts.

```typescript
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
```

A plugin cannot ask for the camera this way; video is reserved for Omniscio's own recorder.

---

### `auth.sharedSignIn`

**Grants access to:** the shared webview sign-in session (**webview** only; no namespace)

Share one browser sign-in session with the other plugins the person allowed this for, so a set of
related plugins signs in once rather than once each. **Elevated**, because those plugins can then see
each other's saved sign-in data: the person approves the group, and a plugin outside it stays on its
own isolated session.

Declare it alongside `auth` when your plugin reads who is signed in.

---

### `boards.link`

**Grants access to:** `Omniscio.boardLinks` (**webview** — `create`, `listForEntity`, `remove`, `searchItems`)

Attach your plugin's own content to a task on a board the person granted, and detach it again —
without ever changing the task itself. `create({ itemId, entityId, label? })` links one of your items
to a task, `listForEntity({ entityId })` reads the links on one task, `remove({ linkId })` detaches
one, and `searchItems({ query, limit? })` finds tasks to link to (up to 50 results).

**Elevated**: it writes on the person's task list. Pair it with [`boards.read`](#boardsread) to show
the boards themselves.

---

### `boards.write`

**Grants access to:** `ctx.boards` changes (**backend** — `createItem`, `updateItem`, `setValue`, `comment`), on the boards the person picked

Add, move and update items and post comments on the boards the person picked for your plugin. Nothing
is shared until they pick, and a plugin can never change more than the person could change
themselves. Assigning a person or posting a comment asks the person first, every time.

**Elevated**: it changes the person's boards. It **requires** [`boards.read`](#boardsread) in the same
manifest, so the install card says exactly what the plugin holds. See [Boards](../api/boards).

---

### `tasks.read`

**Grants access to:** the webview's `Omniscio.tasks` namespace (`requestAccess()` and `listLists()`) and `ctx.tasks` reads (**backend** — `listLists`, `list`, `get`), on the task lists the person picked

Read the task lists the person picked for your plugin, including each task, its due date and its
status. The person chooses the lists, or "all lists, including new ones", and nothing is shared until
they do.

Standard tier: it only reads. Available when the person has turned on Plugin access to boards and
tasks in Labs. See [Tasks](../api/tasks).

---

### `tasks.write`

**Grants access to:** `ctx.tasks` changes (**backend** — `create`, `update`, `complete`, `reorder`, `archive`, `restore`, `delete`), on the task lists the person picked

Add, edit, complete, move, archive and restore tasks in the task lists the person picked. Moving a
task needs both the list it leaves and the list it enters to be picked. Deleting a task asks the
person first, every time.

**Elevated**: it changes the person's tasks. It **requires** [`tasks.read`](#tasksread) in the same
manifest. See [Tasks](../api/tasks).

---

### `sessions.launchAny`

**Grants access to:** `ctx.sessions.fanout` (**backend**) — this one permission, not `sessions`

Start sessions in any of the person's projects, with any engine and model, in one batch. A plugin
that only batches does not need `sessions` at all, and asking for it would widen the consent card to
session creation and management this call never uses. It is a narrower gate than it sounds:
**built-in plugins and first-party marketplace plugins the Marketplace has classified only** — a
third-party plugin is refused even with the permission declared. Every session it starts is paid, so
call it only for a batch the person asked for.

See the [Sessions API](../api/sessions).

---

### `sessions.observeStatus`

**Grants access to:** the session-status feed (**webview** only; no namespace)

See when the person's sessions start, finish, or need them, so a plugin can show a live activity
indicator. It never sees a session's text, and it grants nothing over a session.

---

### `sessions.control`

**Grants access to:** the webview's `Omniscio.sessionControl` namespace (`requestAccess()`) and `ctx.sessionControl` (**backend** — `list`, `message`, `pause`, `unpause`, `snooze`, `archive`, `unarchive`), on the sessions and projects the person picked

Message, pause, unpause, snooze, archive and unarchive the sessions the person picked for your
plugin, including sessions your plugin did not start. A picked project covers its later sessions too.
Nothing is shared until they pick. It never sees what a session says, it never reaches private AI
Coaching or Journal sessions, hidden or review sessions, or another plugin's sessions, and it never
changes a session running on another computer.

Messaging, pausing, archiving, unpausing and unarchiving ask the person first, unless they turned that
ask off in Settings → Plugins; unpausing or unarchiving a session they closed themselves always asks.
Snoozing never asks. A session with an answer the person has not read is never archived by a plugin.
10 changes and 60 reads a minute per plugin.

**Elevated**: it changes the person's sessions. It does not need `sessions`. Available when the person
has turned on Plugin control of your sessions in Labs. See [Session Control](../api/session-control).

---

### `vault.read`

**Grants access to:** the webview's `Omniscio.vault` namespace (`requestAccess()`) and `ctx.vault` reads (**backend** — `search`, `notes.list`, `notes.get`), on the Vault folders the person picked

Search, list and open the notes in the Vault folders the person picked for your plugin. A folder covers
its subfolders and notes added later, and matches by whole name, so `Work` never covers `Workshop`. The
person can also pick "All your notes, including new ones". Nothing is shared until they pick. Notes they
hid, the Vault trash, the assets folder and the app's own folders are never returned. Search is the plain
word search: no AI summaries, no meaning-based search. 60 reads a minute per plugin.

Elevated: it reads the person's notes. Available when the person has turned on Plugin access to your
Vault in Labs and the Vault is on. See [Vault](../api/vault).

---

### `vault.write`

**Grants access to:** `ctx.vault.notes` changes (**backend** — `create`, `update`, `rename`, `move`, `delete`), on the Vault folders the person picked

Add, edit, rename and move notes in the Vault folders the person picked. An edit must carry the time
your plugin last read the note; if the note changed since, the edit is refused as a conflict and nothing
changes. A move needs both the folder it leaves and the folder it enters to be picked. Deleting a note
asks the person first, every time, and the note goes to the Vault trash where they can restore it.
10 changes a minute per plugin.

**Elevated**: it changes the person's notes. It **requires** [`vault.read`](#vaultread) in the same
manifest. See [Vault](../api/vault).

---

### `inbox.read`

**Grants access to:** `ctx.inbox.listMine()` (**backend** only)

See the titles of the person's open inbox items and of the sessions waiting on them, newest first,
with each item's kind, time and whether it is asking them something. Never an item's text, links,
files, prompts, forms, fields, sender or source session. Snoozed and answered items, items filed for
an agent crew, items any plugin posted, and private, hidden, review or remote sessions never appear.
1 to 100 items a call (25 by default). 60 reads a minute per plugin, shared with the other work-data
reads. It is separate from [`inbox`](#inbox): neither needs the other.

Elevated: it reads what is waiting for the person. Available when the person has turned on Plugin
access to your inbox in Labs. See [Inbox](../api/inbox).

---

### `calendar.read`

**Grants access to:** the webview's `Omniscio.calendar` namespace (`requestAccess()`) and `ctx.calendar` reads (**backend** — `calendars.list`, `events.list`, `freeBusy`), on the calendars the person picked

Read the events, guests, meeting links and free or busy time on the Google and Outlook calendars the
person picked for your plugin, or on all their calendars including ones they add later. Nothing is
shared until they pick. A calendar they can only see as free or busy is never listed, and its events
are never returned. A read covers at most 90 days and returns at most 250 events. 60 reads a minute
per plugin.

Elevated: it reads the person's calendars. Available when the person has turned on Plugin access to
your calendars in Labs and a calendar is connected. See [Calendar](../api/calendar).

---

### `calendar.write`

**Grants access to:** `ctx.calendar.events` changes (**backend** — `create`, `update`, `delete`), on the calendars the person picked

Add, edit and delete events on the picked calendars the person can change. Inviting or removing
guests, and every delete, asks the person first. Google guests are emailed only when your plugin asks
for it and the person agrees; Outlook always emails guests. Outlook calendars stay view only until the
person turns on "Let plugins change Outlook calendars". 10 changes a minute per plugin.

**Elevated**: it changes the person's calendars. It **requires** [`calendar.read`](#calendarread) in
the same manifest. See [Calendar](../api/calendar).

---

### `launch`

**Grants access to:** `ctx.launch.open(url | path)` (**backend only**)

Open a link or a file in the app's own viewer, or hand a URL to the browser — with the person
confirming a program's launch. **Elevated**: it is the road from a plugin to something outside the
app, so Omniscio asks before anything runs.

Declare [`system`](#system) for the clipboard and the checked program launcher.

---

### `oauth`

**Grants access to:** `ctx.oauth.authorize(opts)` (**backend only**)

Sign the person in to a third-party service they choose to connect: your backend receives the
resulting tokens and never sees their password. **Elevated** — the consent screen names your plugin,
and the person can revoke the connection at any time.

Prefer [`auth.session`](#authsession) when the service is Google or GitHub; this one is for
everything else.

---

### `channel`

**Grants access to:** `ctx.channel.connect` / `send` / `close` (**backend only**)

Hold a live connection to an external service the person chose — a socket or a stream — and send and
close it. `connect` subscribes, so your backend keeps receiving until you call `close()`; a long-lived
connection needs a `backend` in the manifest. **Elevated**.

---

### `documents.read`

**Grants access to:** the read methods of the Writer namespace (**webview** — `list`, `get`,
`folderList`, `search`, `exportFile`, `driveListFiles`, `publishToGoogleDoc` and their siblings)

Open and search everything the person has written in the app, and publish one of those documents to
a Google account they have connected. Read-only: nothing is changed.

The separate `Omniscio.documents` API, which opens the one document the person picked, needs no
permission at all.

---

### `documents.write`

**Grants access to:** the write methods of the Writer namespace (**webview** — `create`,
`saveContent`, `delete`, `restore`, `folderCreate`, `folderDelete`, `importFromFile`,
`publishToShares` and their siblings)

Create, change and permanently delete what the person has written, including restoring an older
version over the current one. **Elevated**, and it does not imply read: declare both when your plugin
needs to list what it edits.

---

### `members.read`

**Grants access to:** `Omniscio.members.list()` (**webview** and backend — `ctx.members.list()`)

Read the names, pictures and roles of the people in the workspace the person is using. It never sees
email addresses, and it grants nothing about their sessions or their content.

---

### `people.read`

**Grants access to:** `ctx.people.schedules.list()` and `ctx.people.timeOff.list({ from, to })`
(**backend** only)

See the working days and hours of the people in the workspace, and the days they are away, never more
than the person could see in Mission Control: an admin or a project lead sees everyone's hours, anyone
else only their own. Why someone is away is shown only for the person's own days, or for everyone's
when the person is an admin, and never when it was kept private. Never an email address or a role. 60
reads a minute per plugin, shared with the other work-data reads, and every read is logged.

It **requires** [`members.read`](#membersread) in the same manifest. Available when the person has
turned on Plugin access to people's schedules in Labs. See [People](../api/people).

---

### `workspace.read`, `workspace.write`, `workspace.exec`

**Grants access to:** `ctx.workspace` (**backend**) — three separate grants over the projects the
person hands your plugin

`workspace.read` enumerates and reads a granted project's files and worktrees; `workspace.write`
creates, changes and deletes them; `workspace.exec` runs one bounded command inside a granted
project, behind a native confirm. They are **elevated**, and none implies another: a manifest asking
for `workspace.write` or `workspace.exec` without an explicit `workspace.read` is refused by the host
loader, the marketplace publish gate and `omniscio-plugin validate`.

See the [Workspace API](../api/workspace) for the methods, and the note under the summary table for
why the host will not infer one from another.

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
| `secrets` | `PluginSecrets` | Store credentials encrypted by the OS keychain |
| `sessions` | `PluginSessions` | Create/manage Claude Code sessions |
| `sessions.images` | `PluginSessions.sendMessage` `images` option | Send pictures to your own tool-less AI session (needs `sessions` too) |
| `ai.images` | `AgentMC.ai.estimateImage` / `generateImage` (**webview**) | Make one Image Studio picture per request on the user's credit, after Omniscio's own price confirmation (**elevated**) |
| `sessions.readHistory` | `PluginSessionHistory` (**webview**) | Read PAST sessions/projects the user explicitly grants |
| `sessions.launchAny` | `ctx.sessions.fanout` (**backend**) | Start a batch of sessions across any project — built-in and first-party plugins only, and it does not need `sessions` |
| `sessions.observeStatus` | *(session-status feed; no namespace)* | See when sessions start, finish or need the person — never their text |
| `sessions.control` | `Omniscio.sessionControl` (**webview**); `ctx.sessionControl` (**backend**) | Message, pause, unpause, snooze, archive and unarchive the sessions and projects the person picked; never their text; most changes ask first — elevated |
| `vault.read` | `Omniscio.vault` (**webview**); `ctx.vault` reads (**backend**) | Search, list and open the notes in the Vault folders the person picked; never hidden notes, the trash or the app's own folders — elevated |
| `vault.write` | `ctx.vault.notes` changes (**backend**) | Add, edit, rename and move notes in the Vault folders the person picked; deleting asks first (**requires `vault.read`**) — elevated |
| `calendar.read` | `Omniscio.calendar` (**webview**); `ctx.calendar` reads (**backend**) | Read events, guests, meeting links and free or busy time on the calendars the person picked — elevated |
| `calendar.write` | `ctx.calendar.events` changes (**backend**) | Add, edit and delete events on the picked calendars the person can change; guests and deletes ask first (**requires `calendar.read`**) — elevated |
| `ai` | `PluginAi` | Direct AI text generation |
| `tts` | `PluginTts` (**webview**, `Omniscio.tts`) | Read text aloud with the user's configured voice (metered) |
| `stt` | `Omniscio.stt` (**webview**) | Turn a recording into text with the configured speech service (metered) |
| `microphone` | *(media-permission guard; no namespace)* | Record from the microphone while your panel is open — elevated |
| `network` | `PluginHttp` | Outbound HTTP requests |
| `network.upload` | `Omniscio.http.uploadFile` (**webview**) | Upload a picked-folder file to the sites listed in `uploadHosts` (**requires `uploadHosts`**) |
| `cron` | `PluginCron` | Scheduled background tasks |
| `cli` | `PluginCli` | HTTP endpoints on Omniscio's control server |
| `notifications` | `PluginToast.notify()` | Native OS desktop notifications |
| `system` | Host launcher / clipboard / file-open | Open paths and read the clipboard from your UI, and run an allow-listed or pinned program through `ctx.process` (backend) or `window.Omniscio.process` (UI); a backend's own `child_process` is refused by the sandbox |
| `rss` | `ctx.rss` (`fetchFeed`, `listFeeds`, `getRecentEntries`) | Read RSS feeds and articles from Omniscio's Channels |
| `auth` | `PluginAuth` (identity) + `AgentMC.auth.getWebAuth()` (**webview**) | See who is signed in, and take a real sign-in credential the plugin can use to read and send Team Chat as that person, still valid after Omniscio closes — elevated |
| `auth.session` | `PluginAuth.getSession()` | Scoped Google/GitHub access tokens on the user's behalf |
| `auth.sharedSignIn` | *(shared webview sign-in session)* | Sign in once across the plugins the person grouped — elevated |
| `oauth` | `ctx.oauth.authorize` (**backend**) | Sign the person in to another service they choose — elevated |
| `channel` | `ctx.channel.connect` / `send` / `close` (**backend**) | Hold a live connection to an external service — elevated |
| `launch` | `ctx.launch.open` (**backend**) | Open a link or file, or run a program the person confirms — elevated |
| `documents.read` | Writer namespace, read methods (**webview**) | Open and search the person's documents |
| `documents.write` | Writer namespace, write methods (**webview**) | Create, change and delete the person's documents — elevated |
| `members.read` | `Omniscio.members.list()` (webview + backend) | See the names, pictures and roles of the workspace's people |
| `people.read` | `ctx.people.schedules.list()` / `ctx.people.timeOff.list()` (**backend**) | See when the workspace's people work and when they are away, never more than the person could see (**requires `members.read`**) |
| `auth.actAsUser` | `AgentMC.auth.getWebAuth()` (**webview**) | Sign in to the shared account as the person -- **elevated**; reads and sends as them |
| `chrome` | Toolbar / context-menu / navigation (UI bridge) | Contribute chrome and navigate the app shell |
| `chrome.widget` | `Omniscio.widget` (**webview**) | A live status widget in the titlebar (**requires `chrome`** as well) |
| `firebase` | `PluginFirebase` (**webview**) | List the user's Firebase accounts/projects; start a login |
| `recording` | `PluginRecording` | Screen recording, host-mediated with a per-start confirm (backend only) |
| `email.send` | `PluginEmail` | Send one email per call from the user's agent address, host-mediated; `ctx.email.sender()` reads which address that is, and sends nothing (backend only) |
| `email.fromName` | `PluginEmail` (`fromName` on `send`) | Put a display name beside the agent address; cleaned, capped at 64 characters, never the app's own name; needs `email.send` (backend only) |
| `inbox` | `PluginInbox.setItems()` | Contribute rows to the Omniscio inbox |
| `inbox.read` | `ctx.inbox.listMine()` (**backend**) | See the titles of the person's open inbox items and waiting sessions, never their contents — elevated |
| `navigation` | *(host-gated; no `ctx` API)* | Navigate Omniscio to sessions, projects, and views |
| `spend` | `PluginSpend` | Read-only AI cost/usage totals for spend reports |
| `boards.read` | `Omniscio.boards` (**webview**); `ctx.boards` reads (**backend**) | Read the boards the person grants: items, column values and statuses |
| `boards.link` | `Omniscio.boardLinks` (**webview**) | Attach and detach your own content on a task the person granted — elevated |
| `boards.write` | `ctx.boards` changes (**backend**) | Add, move and update items on the boards the person picked; assigning a person and commenting ask first (**requires `boards.read`**) — elevated |
| `tasks.read` | `Omniscio.tasks` (**webview**); `ctx.tasks` reads (**backend**) | Read the task lists the person picked: tasks, due dates and status |
| `tasks.write` | `ctx.tasks` changes (**backend**) | Add, edit, complete, move, archive and restore tasks in the lists the person picked; deleting asks first (**requires `tasks.read`**) — elevated |
| `coreRead` | `PluginCore` (`ctx.core`, backend only) | Elevated, blanket read of sessions, projects and message text |
| `workspace.read` | `WorkspaceApi` (read half) | Enumerate and read the user's real project files and worktrees |
| `workspace.write` | `WorkspaceApi.writeFile` / `writeFiles` / `mkdir` / `deleteFile` | Write to the user's real project files (does NOT imply `workspace.read` — declare both) |
| `workspace.exec` | `WorkspaceApi.run` | Run one bounded command in a granted project, behind a native confirm |
| `webassembly` | *(no API; the panel's script policy)* | Compile and run WebAssembly in your own panel (`'wasm-unsafe-eval'` only, never `'unsafe-eval'`) |
| *(none)* | `PluginSettings`, `PluginLogger`, `PluginEvents`, `PluginSidebar`, `PluginToast.show()` | Always available |

::: warning `workspace.*` is real, and the three do not imply one another
This section previously said the host had no `workspace` runtime. It has had one since
2026-08-05: fourteen backend methods, with `workspace.write` and `workspace.exec` gating real
mutating and command-running calls.

A manifest asking for `workspace.write` or `workspace.exec` **without an explicit
`workspace.read`** is rejected — by the host loader, by the marketplace publish gate, and by
`omniscio-plugin validate`. The host refuses to infer it so the consent card the user reads matches
what the plugin actually holds. See the [Workspace API](../api/workspace).
:::

::: danger Four permissions grant a WEBVIEW namespace, not a backend one
`tts`, `sessions.readHistory`, `firebase` and `chrome.widget` gate `Omniscio.tts` / `Omniscio.sessionHistory` /
`Omniscio.firebase` / `Omniscio.widget`. The host builds no backend entry for any of them, so `ctx.tts` and friends
are `undefined` — a `TypeError` at activation, not a permission error. The table above lists
the type each grants; the surface is the webview.
:::
