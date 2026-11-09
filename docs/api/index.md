# API Reference

The Omniscio Plugin SDK exposes 41 APIs to plugins. Some are available on both the frontend (via the `Omniscio` bridge) and the backend (via the `PluginContext`); others are backend-only or frontend-only.

## API Summary

| API | Description | Availability | Permission |
|---|---|---|---|
| [Storage](./storage) | Key-value storage | Both | `storage` |
| [Secrets](./secrets) | Keychain-encrypted credentials | Both | `secrets` |
| [Database](./db) | Collection-based CRUD | Both | `storage` |
| [Sessions](./sessions) | Spawn and manage Claude sessions | Both | `sessions` |
| [AI](./ai) | Generate text with AI models | Both | `ai` |
| [Filesystem](./fs) | Read and write files | Backend only | `storage` |
| [HTTP](./http) | Fetch external URLs | Backend only | `network` |
| [Cron](./cron) | Schedule recurring tasks | Backend only | `cron` |
| [CLI Endpoints](./cli) | Register REST endpoints | Backend only | `cli` |
| [Sidebar](./sidebar) | Badge count and item list | Both | None |
| [Toast](./toast) | In-app and OS notifications | Both | `notifications` (for `notify`) |
| [Settings](./settings) | Read plugin settings | Both | None |
| [Events](./events) | Messaging between your UI and backend | Both | None |
| [Logging](./logging) | Structured log output | Backend only | None |
| [Inbox](./inbox) | Surface items in Omniscio's inbox | Both | `inbox` |
| [Auth](./auth) | Signed-in identity and scoped account tokens | Both | `auth` (`auth.session` for tokens) |
| [Recording](./recording) | Screen recording, host-mediated | Backend only | `recording` |
| [Email](./email) | Send one email from the user's agent address | Backend only | `email.send` |
| [Text to Speech](./tts) | Speak text with the user's configured voice | Webview only | `tts` |
| [Session History](./session-history) | Read past sessions the user has granted | Webview only | `sessions.readHistory` |
| [Firebase](./firebase) | The user's Firebase accounts and projects | Webview only | `firebase` |
| [Spend](./spend) | Read-only AI cost and usage totals | Backend only | `spend` |
| [Workspace](./workspace) | The user's real project checkouts and worktrees | Backend only | `workspace.read` / `.write` / `.exec` |
| [Backend Calls](#backend-calls) | Call your backend's handlers from your panel | Both | None |
| [Host Capabilities](#host-capabilities) | Feature-detect what this Omniscio supports | Both | None |
| [Core](./core) | Read-only view of the user's sessions, projects and message text | Backend only | `coreRead` |
| [Widget](./widget) | A live status widget in the Omniscio titlebar | Webview only | `chrome` + `chrome.widget` |
| [Boards](./boards) | Choose and list the boards the user shares with the plugin | Webview only | `boards.read` |
| [Board Links](./board-links) | Link board items to things your plugin owns | Webview only | `boards.link` |
| [Channel](./channel) | Long-lived outbound WebSocket | Backend only | `channel` |
| [Clipboard](./clipboard) | Read and write the system clipboard | Webview only | `system` (`has` needs none) |
| [Launch](./launch) | Open links and documents, run programs the user confirms | Backend only | `launch` |
| [Members](./members) | People in the active workspace | Both | `members.read` |
| [Navigation](./navigation) | Move the user to a session or a teammate chat | Webview only | `navigation` |
| [Notifications](./notifications) | System notifications with tags and Focus Mode | Webview only | None |
| [OAuth](./oauth) | Third-party sign-in with your own client | Backend only | `oauth` |
| [Process](./process) | Run programs listed in the manifest | Both | `system` |
| [RSS](./rss) | Fetch feeds and read the user's collected articles | Backend only | `rss` |
| [Share](./share) | Publish an HTML page as a public link | Webview only | `firebase` |
| [Shell](./shell) | Open links and files, system dialogs | Webview only | None for links and dialogs; `system` for `openPath` and `showItemInFolder` |
| [Speech to Text](./stt) | Transcribe a recording | Webview only | `stt` |

## Access Patterns

**Backend** -- the `PluginContext` object is passed to your plugin's `activate()` function:

```typescript
// src/backend/index.ts
import type { PluginContext } from '@omniscio/plugin-sdk'

export function activate(ctx: PluginContext) {
  ctx.storage.set('initialized', true)
  ctx.log.info('Plugin activated')
}
```

**Frontend** -- the global `Omniscio` bridge is available in your UI code:

```typescript
// src/ui/plugin.ts
const value = await Omniscio.storage.get('initialized')
Omniscio.toast.show({ type: 'info', message: 'Hello from the UI' })
```

::: tip One bridge, two names
The bridge is `window.Omniscio`. The same object is also installed as `window.AgentMC`, its name before SDK 3.4.0, so plugins written against the old name keep working. An Omniscio released before 3.4.0 only installs `window.AgentMC`; if your plugin should run there too, read the bridge as `const omniscio = window.Omniscio ?? window.AgentMC`.
:::

## Backend Calls

Your backend registers a handler with `ctx.rpc`, and your panel calls it with `Omniscio.backend.invoke`. The call resolves to whatever the handler returns.

```typescript
// backend
ctx.rpc?.handle('notes:count', async () => (await ctx.db.query('notes')).length)

// panel
const count = await Omniscio.backend?.invoke('notes:count')
```

| Member | Description |
|---|---|
| `ctx.rpc.handle(method, handler)` | Register (or replace) the handler for `method` |
| `ctx.rpc.removeHandler(method)` | Remove it |
| `Omniscio.backend.invoke(method, ...args)` | Call it from your panel |

- Needs Omniscio v0.1.92. Both members are `undefined` on older hosts, so check before you call.
- Arguments and the result travel as JSON, and a thrown error reaches the panel as its message only.
- The host gives up on a call after 240 seconds, and refuses more than 100 calls in flight per plugin.
- For anything that changes data, use the [command channel](../guide/commands) instead: it checks input, runs changes one at a time and reports honest outcomes on top of these calls.

## Host Capabilities

`Omniscio.host.getCapabilities()` resolves to the capability tokens this Omniscio supports, such as `'ai-engine-choice'`. A missing token means no. It needs no permission and exists from Omniscio v0.1.89.

```typescript
const tokens = (await Omniscio.host?.getCapabilities()) ?? []
const canPickEngine = tokens.includes('ai-engine-choice')
```

The backend twin, `ctx.host.getCapabilities()`, is typed ahead of the Omniscio release that adds it, and is `undefined` until then.

## Model Picker

`Omniscio.modelPicker.open(request)` opens Omniscio's own model picker over your button and resolves to the row picked (`''` = the default row) or `null` when dismissed. Never draw your own engine or model picker. It needs no permission: check for the `'model-picker'` token first, and show a plain select on an older host or when the call rejects.

```typescript
const picked = await Omniscio.modelPicker.open({
  value: stored,
  defaultLabel: 'Claude, Sonnet',
  options: [{ value: 'deepseek:v4', label: 'V4', group: 'DeepSeek' }],
  anchor: button.getBoundingClientRect().toJSON()
})
```

Every row needs a `group` (its heading); `disabled` + `reason` shows a row that cannot be picked yet. Only `''`, `null` or one of your enabled values ever comes back.

## Bridge-Only APIs

The following APIs are available **only on the frontend** through the `Omniscio` bridge. They do not have backend equivalents and do not require permissions.

### Theme

Read and react to Omniscio's current theme.

```typescript
// Get the current theme — this is a PROMISE
const theme = await Omniscio.theme.get()
// theme: { mode: string; accent: string; surfaces: Record<string, unknown> }
// NOTE: static placeholder host-side — mode is always 'dark' today.

// Listen for theme changes
const unsubscribe = Omniscio.theme.onChange((theme) => {
  document.body.className = theme.mode
})
```

| Method | Returns | Description |
|---|---|---|
| `get()` | `Promise<{ mode: string; accent: string; surfaces: Record<string, unknown> }>` | Current theme. `visualTheme` never existed; `get()` is async |
| `onChange(callback)` | `() => void` | Subscribe to theme changes. Returns an unsubscribe function |

### Locale

Show your text in the language the user picked for Omniscio, and switch when they change it.

```typescript
// At load: the language Omniscio was in when your panel opened
const loc = window.__AMC_LOCALE__
// loc: { uiLanguage: 'zh-TW', formattingLocale: 'zh-TW', dir: 'ltr', timeZone: 'Asia/Taipei' }

// Later changes, without a reload
const unsubscribe = Omniscio.locale.onChange((loc) => {
  loadCatalog(loc.uiLanguage)
  document.documentElement.dir = loc.dir
})
```

| Field | Meaning |
|---|---|
| `uiLanguage` | The app language code exactly as the user chose it (`zh-TW`, `zh-CN`, `pt-BR`, `tl`, `es`). Pick your catalog with this |
| `formattingLocale` | The locale for dates, numbers and money (`tl` formats as `fil-PH`). Format with this, never with `uiLanguage` |
| `dir` | `rtl` for Arabic, Hebrew, Persian, Urdu and the other right-to-left scripts, else `ltr` |
| `timeZone` | The computer's IANA time zone, when known |

| Method | Returns | Description |
|---|---|---|
| `onChange(callback)` | `() => void` | Fires once each time the app language changes, with the object above. Works the same in a panel, an overlay window and on a paired phone. Returns an unsubscribe function |

`window.__AMC_LOCALE__` is fixed at load; `onChange` is the only live source. No permission is needed.

### Export

Save files, generate PDFs, and interact with the user's filesystem through system dialogs.

```typescript
// Save a text file (shows Save As dialog)
await Omniscio.export.saveFile({
  filename: 'report.md',
  content: markdownContent,
  type: 'text/markdown',
})

// Generate and save a PDF — note the casing, and it takes HTML
const saved = await Omniscio.export.savePdf({
  filename: 'report.pdf',
  html: renderedHtml,
})
if (!saved.saved) console.log('user cancelled')

// Let the user pick a folder
const folder = await Omniscio.export.pickFolder({
  title: 'Choose output directory',
})

// Write multiple files to a directory
await Omniscio.export.writeFiles({
  directory: folder,
  files: [
    { name: 'index.ts', content: tsCode },
    { name: 'styles.css', content: cssCode },
  ],
})

// Verify files exist
await Omniscio.export.verifyFiles({
  directory: folder,
  files: ['index.ts', 'styles.css'],
})

// Open a folder in the system file manager
await Omniscio.export.openFolder({ path: folder })
```

| Method | Description |
|---|---|
| `saveFile(opts)` | Show a Save As dialog and write a file. Resolves `{ saved }` — never the file's path |
| `savePdf(opts)` | Render **HTML** to PDF and save. Resolves `{ saved }` — never the file's path. (`savePDF` with that casing does not exist) |
| `pickFolder(opts?)` | Show a folder picker dialog, returns the selected path |
| `writeFiles(opts)` | Write multiple files to a directory |
| `verifyFiles(opts)` | Check that files exist in a directory |
| `openFolder(opts)` | Open a folder in the OS file manager |

### Project

Query and create Omniscio projects.

```typescript
// List all projects
const projects = await Omniscio.project.listAll()

// Find a project by folder path
const project = await Omniscio.project.findByFolder('/path/to/repo')

// Create a new project
const newProject = await Omniscio.project.create({
  name: 'My App',
  folderPath: '/path/to/my-app',
})

// Open Omniscio's Add Project dialog with a folder pre-selected
await Omniscio.project.openAddDialog({
  preselectedFolder: '/path/to/repo',
})
```

| Method | Description |
|---|---|
| `listAll()` | List all projects in Omniscio |
| `findByFolder(folderPath)` | Find a project by its folder path |
| `create(opts)` | Create a new project |
| `openAddDialog(opts)` | Open the native Add Project dialog |

### Assets

Read files bundled with your plugin (from the `assets/` directory in your plugin package).

```typescript
// Read a bundled file
const template = await Omniscio.assets.readFile('templates/default.md')

// List files in a directory
const files = await Omniscio.assets.listFiles('templates')
```

| Method | Returns | Description |
|---|---|---|
| `readFile(path)` | `Promise<string>` | Read a bundled asset file as text |
| `listFiles(path)` | `Promise<string[]>` | List files in a bundled asset directory |

### Documents

Read and append to files the user picked from the OS file picker, and hand the user **new** files they choose a place for. Webview-only — there is no `ctx.documents` — and it needs **no permission**, because the native window itself is the consent.

```typescript
// Ask for a file. Resolves [] if the user cancels.
const [doc] = await Omniscio.documents.open({
  mode: 'readwrite',
  title: 'Choose a PDF',
  filters: [{ name: 'PDF', extensions: ['pdf'] }]
})
if (!doc) return

// Read the bytes via fetch. `url` is opaque — never parse it.
const bytes = await (await fetch(doc.url)).arrayBuffer()

// Append. Always stat() first — expectedLength is only loosely checked.
const base64Delta = btoa('appended text')
const { length } = await Omniscio.documents.stat(doc.id)
await Omniscio.documents.append(doc.id, base64Delta, { expectedLength: length })

// Recover Handles after a webview reload, and release when done.
console.log(`${(await Omniscio.documents.list()).length} still open`)
await Omniscio.documents.close(doc.id)

// Hand the user a NEW file. The Save window is the consent; nothing else is created.
const one = await Omniscio.documents.saveCopy({ name: 'summary.pdf', base64 })
if (one.saved) console.log(one.names) // ['summary.pdf'] — a bare name, never a path

// Several at once, into a folder they pick. Never replaces an existing file.
const many = await Omniscio.documents.saveCopies({
  title: 'Where should the parts go?',
  files: [{ name: 'part 1.pdf', base64 }, { name: 'part 2.pdf', base64 }]
})
```

| Method | Returns | Description |
|---|---|---|
| `open(options)` | `Promise<DocumentHandle[]>` | Show the file picker and mint a Handle per chosen file; `[]` if cancelled |
| `list()` | `Promise<DocumentHandle[]>` | The Handles this plugin still holds, with freshly re-stat'd sizes |
| `stat(handleId)` | `Promise<{ length: number }>` | The Document's current length — the value to pass as `expectedLength` |
| `append(handleId, base64, options)` | `Promise<{ length: number }>` | The only write to a picked file; resolves the new length |
| `close(handleId)` | `Promise<void>` | Drop the Handle; the file itself is untouched |
| `saveCopy(options)` | `Promise<{ saved: false } \| { saved: true, names: string[] }>` | Save one NEW file where the user chooses; may replace, atomically |
| `saveCopies(options)` | `Promise<{ saved: false } \| { saved: true, names: string[] }>` | Save several NEW files into a folder the user chooses; never replaces |

`saveCopy` and `saveCopies` are the copy half of the namespace. Neither takes a path or a folder, neither leaves a folder grant or a Handle behind, and neither touches the document you opened — so a helper that saves three files asks the user three times, and should be designed to do so. `saveCopy` may replace a file the user picked in the Save window, but only once the whole new copy is ready, so an interrupted save leaves the old file intact. `saveCopies` reserves every name exclusively and adds a number on a clash (`report (2).pdf`); the `names` in the reply are what was actually written. A call that fails part-way removes the copies it had already written. Names must be bare file names, and one call carries about 24 MiB of decoded bytes.

A `DocumentHandle` is `{ id, name, size, mode, url }` and carries no path. Two of those fields mislead if you skim them:

- **`size` is live when the Handle is serialized, not when the file was picked** — but it freezes the moment the call resolves. Never pass a `size` you are holding as `expectedLength`; call `stat()` each time. A stale length is not reliably an error: the host refuses only when the region you would discard is *larger* than the payload you write, so a slightly stale one silently overwrites your own recent bytes.
- **`url` is opaque, and only works through `fetch`.** Never parse, log, or persist it. Documents are served as `application/octet-stream` with `nosniff` and `Content-Disposition: attachment`, so it is not usable as an `<img src>` or `<iframe src>`. Its path shape is not a contract, and it is on its way to carrying a capability token that grants read access to the file.

`append` takes its arguments as `(handleId, base64, options)`. Both leading arguments are strings, so transposing them still typechecks — the host rejects the id at runtime instead.

A `read` Handle refuses `append`; the mode is fixed when the Handle is minted. And if the file is replaced on disk — which an ordinary Save in Preview or Word does — `append` refuses `not-the-picked-document` and that Handle is finished: call `open()` again for a fresh gesture.

::: warning No offline mock yet
The SDK ships no mock for `documents`. Both its mocks — `createTestContext()` and the dev shell's context — implement `PluginContext`, the **backend** type, and `documents` is deliberately absent from it, so neither can host this namespace without typing a capability a plugin backend cannot call. Faking it would repeat the `ctx.events` failure, where an in-memory fake kept plugin tests green for months while the production path was dead in both directions. Stub it yourself until a webview mock surface exists.
:::

::: warning Gating is in flux
`documents` is live and ungated on Omniscio `master`, but an in-flight host change puts it behind an in-development `plugin-documents-io` flag that defaults **off**. On a build with that flag, every call rejects with `This capability is not available.` — a passing typecheck here is not evidence the host will answer.
:::
