# API Reference

The AMC Plugin SDK exposes 21 APIs to plugins. Some are available on both the frontend (via the `AgentMC` bridge) and the backend (via the `PluginContext`); others are backend-only or frontend-only.

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
| [Inbox](./inbox) | Surface items in AMC's inbox | Both | `inbox` |
| [Auth](./auth) | Signed-in identity and scoped account tokens | Both | `auth` (`auth.session` for tokens) |
| [Recording](./recording) | Screen recording (bridge not yet wired) | Both | `recording` |
| [Text to Speech](./tts) | Speak text with the user's configured voice | Backend only | `tts` |
| [Session History](./session-history) | Read past sessions the user has granted | Backend only | `sessions.readHistory` |
| [Firebase](./firebase) | The user's Firebase accounts and projects | Backend only | `firebase` |
| [Spend](./spend) | Read-only AI cost and usage totals | Backend only | `spend` |
| [Workspace](./workspace) | The user's real project checkouts and worktrees (**host runtime not implemented yet**) | Backend only | `workspace.read` / `.write` / `.exec` |

## Access Patterns

**Backend** -- the `PluginContext` object is passed to your plugin's `activate()` function:

```typescript
// src/backend/index.ts
import type { PluginContext } from '@agent-mc/plugin-sdk'

export function activate(ctx: PluginContext) {
  ctx.storage.set('initialized', true)
  ctx.log.info('Plugin activated')
}
```

**Frontend** -- the global `AgentMC` bridge is available in your UI code:

```typescript
// src/ui/plugin.ts
const value = await AgentMC.storage.get('initialized')
AgentMC.toast.show({ type: 'info', message: 'Hello from the UI' })
```

## Bridge-Only APIs

The following APIs are available **only on the frontend** through the `AgentMC` bridge. They do not have backend equivalents and do not require permissions.

### Theme

Read and react to AMC's current theme.

```typescript
// Get the current theme
const theme = AgentMC.theme.get()
// theme: { mode: 'dark' | 'light', visualTheme: string }

// Listen for theme changes
const unsubscribe = AgentMC.theme.onChange((theme) => {
  document.body.className = theme.mode
})
```

| Method | Returns | Description |
|---|---|---|
| `get()` | `{ mode: string; visualTheme: string }` | Current theme state |
| `onChange(callback)` | `() => void` | Subscribe to theme changes. Returns an unsubscribe function |

### Export

Save files, generate PDFs, and interact with the user's filesystem through system dialogs.

```typescript
// Save a text file (shows Save As dialog)
await AgentMC.export.saveFile({
  filename: 'report.md',
  content: markdownContent,
  type: 'text/markdown',
})

// Generate and save a PDF
await AgentMC.export.savePDF({
  filename: 'report.pdf',
  markdown: markdownContent,
  metadata: { title: 'Weekly Report' },
})

// Let the user pick a folder
const folder = await AgentMC.export.pickFolder({
  title: 'Choose output directory',
})

// Write multiple files to a directory
await AgentMC.export.writeFiles({
  directory: folder,
  files: [
    { name: 'index.ts', content: tsCode },
    { name: 'styles.css', content: cssCode },
  ],
})

// Verify files exist
await AgentMC.export.verifyFiles({
  directory: folder,
  files: ['index.ts', 'styles.css'],
})

// Open a folder in the system file manager
await AgentMC.export.openFolder({ path: folder })
```

| Method | Description |
|---|---|
| `saveFile(opts)` | Show a Save As dialog and write a file |
| `savePDF(opts)` | Render Markdown to PDF and save |
| `pickFolder(opts?)` | Show a folder picker dialog, returns the selected path |
| `writeFiles(opts)` | Write multiple files to a directory |
| `verifyFiles(opts)` | Check that files exist in a directory |
| `openFolder(opts)` | Open a folder in the OS file manager |

### Project

Query and create AMC projects.

```typescript
// List all projects
const projects = await AgentMC.project.listAll()

// Find a project by folder path
const project = await AgentMC.project.findByFolder('/path/to/repo')

// Create a new project
const newProject = await AgentMC.project.create({
  name: 'My App',
  folderPath: '/path/to/my-app',
})

// Open AMC's Add Project dialog with a folder pre-selected
await AgentMC.project.openAddDialog({
  preselectedFolder: '/path/to/repo',
})
```

| Method | Description |
|---|---|
| `listAll()` | List all projects in AMC |
| `findByFolder(folderPath)` | Find a project by its folder path |
| `create(opts)` | Create a new project |
| `openAddDialog(opts)` | Open the native Add Project dialog |

### Assets

Read files bundled with your plugin (from the `assets/` directory in your plugin package).

```typescript
// Read a bundled file
const template = await AgentMC.assets.readFile('templates/default.md')

// List files in a directory
const files = await AgentMC.assets.listFiles('templates')
```

| Method | Returns | Description |
|---|---|---|
| `readFile(path)` | `Promise<string>` | Read a bundled asset file as text |
| `listFiles(path)` | `Promise<string[]>` | List files in a bundled asset directory |

### Documents

Read and append to files the user picked from the OS file picker. Webview-only — there is no `ctx.documents` — and it needs **no permission**, because the picker itself is the consent.

```typescript
// Ask for a file. Resolves [] if the user cancels.
const [doc] = await AgentMC.documents.open({
  mode: 'readwrite',
  title: 'Choose a PDF',
  filters: [{ name: 'PDF', extensions: ['pdf'] }]
})
if (!doc) return

// Read the bytes — hand `url` straight to fetch or pdf.js. Never parse it.
const bytes = await (await fetch(doc.url)).arrayBuffer()

// Append. Always stat() first: `expectedLength` is a compare-and-swap.
const { length } = await AgentMC.documents.stat(doc.id)
await AgentMC.documents.append(doc.id, base64Delta, { expectedLength: length })

// Recover Handles after a webview reload, and release when done.
const stillOpen = await AgentMC.documents.list()
await AgentMC.documents.close(doc.id)
```

| Method | Returns | Description |
|---|---|---|
| `open(options)` | `Promise<DocumentHandle[]>` | Show the file picker and mint a Handle per chosen file; `[]` if cancelled |
| `list()` | `Promise<DocumentHandle[]>` | The Handles this plugin still holds, with freshly re-stat'd sizes |
| `stat(handleId)` | `Promise<{ length: number }>` | The Document's current length — the value to pass as `expectedLength` |
| `append(handleId, base64, options)` | `Promise<{ length: number }>` | The namespace's only write; resolves the new length |
| `close(handleId)` | `Promise<void>` | Drop the Handle; the file itself is untouched |

A `DocumentHandle` is `{ id, name, size, mode, url }` and carries no path. Two of those fields mislead if you skim them:

- **`size` is live when the Handle is serialized, not when the file was picked** — but it freezes the moment the call resolves. Never pass a `size` you are holding as `expectedLength`; call `stat()` each time, or the host refuses the write for discarding your own earlier saves.
- **`url` is opaque.** Never parse, log, or persist it. Its path shape is not a contract, and it is on its way to carrying a capability token that grants read access to the file.

`append` takes its arguments as `(handleId, base64, options)`. Both leading arguments are strings, so transposing them still typechecks — the host rejects the id at runtime instead.

A `read` Handle refuses `append`; the mode is fixed when the Handle is minted. And if the file is replaced on disk — which an ordinary Save in Preview or Word does — `append` refuses `not-the-picked-document` and that Handle is finished: call `open()` again for a fresh gesture.

::: warning No offline mock yet
The SDK ships no mock for `documents`. Both its mocks — `createTestContext()` and the dev shell's context — implement `PluginContext`, the **backend** type, and `documents` is deliberately absent from it, so neither can host this namespace without typing a capability a plugin backend cannot call. Faking it would repeat the `ctx.events` failure, where an in-memory fake kept plugin tests green for months while the production path was dead in both directions. Stub it yourself until a webview mock surface exists.
:::

::: warning Gating is in flux
`documents` is live and ungated on AMC `master`, but an in-flight host change puts it behind an in-development `plugin-documents-io` flag that defaults **off**. On a build with that flag, every call rejects with `This capability is not available.` — a passing typecheck here is not evidence the host will answer.
:::
