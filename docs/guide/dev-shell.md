# Dev Shell

The dev shell is an Electron-based development environment that loads your plugin UI in a standalone window with mock backend APIs and hot-reload. It lets you develop and test your plugin without running the full Omniscio application.

## Launching the Dev Shell

From your plugin directory:

```bash
npm run dev
```

This runs `omniscio-plugin dev`, which:

1. Reads your `manifest.json` to determine the plugin name, version, and entry points
2. Runs an initial TypeScript build
3. Opens an Electron dev-shell window for your plugin, with the plugin name and version in its title
4. Loads your UI entry point (`dist/ui/index.html`) in a webview, with a mock bridge installed as `window.Omniscio` and `window.AgentMC` before your page runs
5. If your plugin has a backend, activates it with a mock `PluginContext`
6. Draws a [Sidebar preview](#sidebar-preview) in the left column, fed by your page and your backend
7. Starts watching `src/`, `manifest.json` and your `ui/` folder for changes

## Hot-Reload

The dev shell uses [chokidar](https://github.com/paulmillr/chokidar) to watch your `src/` directory, `manifest.json`, and the folder holding your manifest's `ui.entryPoint` (and `ui.widget.entryPoint`) when that folder is outside `src/` and `dist/`. That is what makes a flat plugin, whose pages sit in `ui/` rather than `src/ui/`, reload too. When a file changes, it automatically:

1. Debounces rapid changes (300ms delay)
2. Recompiles TypeScript (`tsc`)
3. Copies non-TypeScript files from `src/ui/` to `dist/ui/` (HTML, CSS, images)
4. Triggers the appropriate reload action

### Reload Behavior by File Location

| Changed file | Action |
|---|---|
| `src/ui/*` | Webview reloads automatically -- you see the change instantly |
| `ui/*` (a flat plugin's pages) | Webview reloads automatically |
| `src/backend/*` | Console message: "Backend changed - restart dev shell to apply" |
| `manifest.json` | The plugin is rebuilt and the Sidebar preview re-reads your declared widgets. The page is not reloaded |
| Any other `src/*` file | Treated as a UI change -- webview reloads |

::: warning
Backend changes require a restart of the dev shell. The backend module is loaded once at startup with `require()` and Node.js caches it. Kill the dev shell (close the window or Ctrl+C in the terminal) and run `npm run dev` again to pick up backend changes.
:::

## Mock Webview Bridge

Your panel gets a mock bridge under both names, `window.Omniscio` and `window.AgentMC` (the same object), so panel code runs unchanged:

- **`toast.show(...)`** draws the toast as a banner in the bottom-right corner of your page and logs it.
- **`storage`** (`get`, `set`, `delete`, `list`) keeps values in memory for the session.
- **`settings`** (`get`, `getAll`) answers from `amc-dev-settings.json` beside your plugin.
- **`theme.get()`** answers Omniscio's own placeholder, `{ mode: 'dark', accent: '139,92,246', surfaces: {} }`.
- **`widget.set`, `widget.clear` and `widget.action`** and **`sidebar.setItems` and `sidebar.setBadge`** feed the [Sidebar preview](#sidebar-preview).
- **Every other call** is logged to the terminal as `[dev-shell] <namespace>.<method>` and resolves `undefined`, so nothing throws. Subscribe methods (`on…`) return an unsubscribe function, and their callbacks never fire.

## Sidebar Preview

The left column of the dev shell is a **Sidebar preview**: it shows what your plugin sends to Omniscio's two sidebar surfaces. The banner above it says the data is checked with Omniscio's own rules, that widget actions answer as if the widget is placed in your sidebar, and that the app draws the final look.

**Widgets.** There is one frame per widget in your manifest's `ui.widgets`, with its title and whether it is a `tile` or a `panel`. If you declare no `ui.widgets` but hold `chrome.widget`, the preview shows one tile named after your plugin, which is what Omniscio offers too. A tile frame draws the latest spec you sent with `widget.set` and says "Waiting for widget.set" until you send one. A panel frame says it shows your plugin's page, which is the page on the right.

**What it checks.**

- A spec that breaks a limit is not drawn. The frame lists plain problems that name the field and the limit, and the `widget.set` call rejects, as it does in Omniscio. The limits are the app's own.
- A `widgetId` your manifest does not declare rejects the call.
- A plugin without both `chrome` and `chrome.widget` is refused with Omniscio's wording: "chrome and chrome.widget permissions are required for the widget namespace".
- `widget.clear` empties the tile you name, or every tile when you name none.
- `widget.action` answers like the app. `open-place` answers `ran`, the other four actions answer `needs-confirmation`, and an unknown action, or one with no target, rejects. The preview assumes the widget is placed in your sidebar, so it never answers with the refusal Omniscio gives a widget that is not placed. Buttons on a spec show as chips. Clicking one writes "would ask Omniscio to ..." in the log panel; it does not run anything.

**Rows and badge.** A "Sidebar rows" frame shows the rows from `sidebar.setItems` and the badge from `sidebar.setBadge`. Omniscio keeps good rows and drops bad ones, so the preview does too: dropped rows are listed with their index, id and the reason. A batch Omniscio would turn away (more than 200 rows) shows the refusal.

**Page and backend.** Both feed the same preview. `Omniscio.widget` and `Omniscio.sidebar` from your page, and `ctx.widget` and `ctx.sidebar` from your backend, draw into the same frames. The preview redraws at most every 250 ms.

When you edit `manifest.json`, the preview re-reads your declared widgets and keeps what each one last showed.

## Mock Backend Context

When your plugin has a `backend.entryPoint` in the manifest, the dev shell creates a mock `PluginContext` and calls your `activate` function with it. The mock context logs all API calls to the console so you can observe what your plugin is doing.

### Mock API Behavior

| API | Mock behavior |
|---|---|
| **storage** | Persisted KV store -- survives restarts via `.amc-dev/amc-dev-storage.json` in your plugin dir (in-memory only when no data dir is set) |
| **db** | Faithful in-memory store -- `insert` assigns `id`/`created_at`/`updated_at`; `query` honors `where`, `orderBy` (`{ col: 'asc' | 'desc' }`), `limit`/`offset`, and returns one page of 100 rows when you give no `limit`, like Omniscio; `getById`/`update`/`delete`/`deleteWhere` operate on real rows. Reads return copies |
| **settings** | Seeded from an `amc-dev-settings.json` dev config file next to your plugin; `getAll()`/`get(key)` read from it (empty when the file is absent) |
| **log** | Prints to the terminal with a `[plugin:your-id]` prefix |
| **events** | In-memory `EventEmitter`, backend-only. Backend-to-backend delivery matches Omniscio, but an emit does NOT reach the dev shell's webview -- in Omniscio it reaches both surfaces. Exercise UI-facing events in Omniscio itself |
| **sessions** | `create` returns a mock session ID; `getStatus` always returns `"running"`; `getMessages` replays what you sent via `sendMessage`, in the real backend row shape (`{ id, role, text, timestamp }`) |
| **ai** | Returns `"[AI mock] Response to: ..."` and `"[AI mock] Title: ..."` |
| **fs** | Rejects read/write/delete with an error; `exists` returns `false`; `listDir` returns `[]` |
| **http** | Passes through to real `globalThis.fetch` -- network requests work normally |
| **cron** | Logs registration but does not schedule; `isRegistered` returns `false` |
| **cli** | Logs handler registration but endpoints are not reachable |
| **sidebar** | Logs `setBadge` and `setItems` calls and shows them in the [Sidebar preview](#sidebar-preview) |
| **widget** | `ctx.widget.set` and `clear` draw into the [Sidebar preview](#sidebar-preview), and reject a bad spec like the app. There is no `action`, as in Omniscio |
| **toast** | Logs toast messages and notifications to the console |
| **core** | Read-only sample data: three sessions, two projects and a few messages. An unknown id answers `null` / `[]`, and `messages.list` honours the 200-message cap and `window` |

::: tip
The `http` mock is a passthrough to real `fetch`, so network requests to external APIs work in the dev shell exactly as they would in production. This is useful for testing integrations.
:::

### Dev Config: settings & persisted data

The dev shell reads two conventional locations next to your plugin so you can exercise real plugin logic:

- **`amc-dev-settings.json`** — a JSON object of setting values your plugin reads via `ctx.settings.getAll()` / `ctx.settings.get(key)`. Create it alongside `manifest.json` to drive settings-gated code paths:

  ```json
  {
    "apiKey": "dev-only-key",
    "maxItems": 10,
    "theme": "dark"
  }
  ```

- **`.amc-dev/`** — a working directory the shell uses as the plugin `dataDir`. The KV `storage` API is flushed to `.amc-dev/amc-dev-storage.json`, so anything your plugin writes with `ctx.storage.set()` survives a dev-shell restart, just like the real SQLite-backed store in Omniscio.

::: tip
Add `amc-dev-settings.json` and `.amc-dev/` to your plugin's `.gitignore` — they hold local-only dev state and secrets.
:::

## Debugging

### Chrome DevTools

Open Chrome DevTools in the dev shell window:

- **Windows / Linux:** `Ctrl+Shift+I`
- **macOS:** `Cmd+Option+I`

DevTools opens for the webview hosting your plugin UI. You can inspect elements, view console output, debug JavaScript, and profile performance exactly as you would in a browser.

### Console Output

The dev shell prints all mock API calls and plugin log messages to the terminal where you ran `npm run dev`. Look for lines prefixed with `[plugin:your-id]`:

```
[plugin:my-plugin] [info] Plugin enabled
[plugin:my-plugin] [db] insert(tasks) { id: '...', title: 'Test', ... }
[plugin:my-plugin] [sidebar] setBadge(3)
```

Hot-reload events are prefixed with `[hot-reload]` and `[dev-shell]`:

```
[hot-reload] Recompiling (ui change)...
[dev-shell] UI changed - reloading webview
```

### Build Errors

If TypeScript compilation fails during hot-reload, the error is printed to the terminal:

```
[hot-reload] Build failed: Error: ...
```

The webview is not reloaded on build failure -- the previous working version stays visible.

## Limitations

The dev shell is designed for rapid UI development and basic backend testing. It does not replicate the full Omniscio runtime:

| Feature | Dev shell | Real Omniscio |
|---|---|---|
| UI rendering | Full (Electron webview) | Full (Electron webview) |
| Theme CSS variables | Not injected — your `var()` fallbacks apply | Injected by Omniscio (see [Theming](./theming)) |
| Storage | Persisted to `.amc-dev/` (JSON file) | SQLite `plugin_kv` (persistent) |
| DB | Faithful in-memory store (where/orderBy/limit, 100-row default page) -- lost on restart | SQLite tables (persistent) |
| Settings | Seeded from `amc-dev-settings.json` | Configured in Omniscio settings UI |
| Sessions | Mock IDs, no real Claude process | Real Claude Code sessions |
| AI generation | Returns placeholder strings | Calls Anthropic API |
| Filesystem | Sandboxed to `ctx.dataDir` (real files; in-memory when no `dataDir`) | Sandboxed to `ctx.dataDir` — the same per-plugin root, also enforced by the worker's OS-level permission allow-set |
| Cron scheduling | Logs only, no execution | Real cron scheduler |
| CLI endpoints | Logs only, not reachable | Reachable via control server |
| Toasts and notifications | `toast.show` draws a banner; other calls log | In-app toasts and real OS notifications |
| Plugin permissions | Not enforced, except that `widget` calls need `chrome` and `chrome.widget` | Enforced at runtime |
| Sidebar badge/items | Shown in the Sidebar preview, with dropped rows and their reasons | Updates Omniscio sidebar |
| Widgets (`Omniscio.widget`, `ctx.widget`) | Shown in the Sidebar preview, checked with the app's rules; the look is a stand-in | Drawn by Omniscio in the widget sidebar, and the first declared widget in the titlebar |
| `ctx.core` data | Fixed sample data | The user's real sessions, projects and messages |

::: tip
For integration testing with real Omniscio APIs, install your built plugin into Omniscio directly. Use `npm run package` to create the `.amcplugin` file, then install it through Settings > Plugins > Install from file.
:::

### What the preview does not show

The preview is a stand-in, not Omniscio's drawing. It does not show the titlebar, the real fonts, colours or icons, the Add picker, or the dialog Omniscio opens before it runs an action. To see the real look, run `npm run package` and install the `.amcplugin` through Settings > Plugins > Install from file.

If your page may also run outside the dev shell, guard the call so the rest of it still works:

```typescript
const amc = (window as unknown as { Omniscio?: Omniscio }).Omniscio
if (amc?.widget?.set) {
  await amc.widget.set({ shape: 'stat', value: '3', label: 'open items', icon: 'Bell' })
}
```

The `widget` template (`omniscio-plugin create my-widget --template widget`) already contains this guard, and its two widgets show in the preview the moment you run `npm run dev`.

## Window Configuration

The dev shell opens at **1200 x 800 pixels** with the title set to your plugin name and version. The window uses standard Electron configuration with:

- `contextIsolation: true`
- `nodeIntegration: false`
- `webviewTag: true`

This matches the security configuration used by Omniscio's own plugin webview host, ensuring your plugin behaves the same in both environments.
