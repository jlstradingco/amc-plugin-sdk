# Dev Shell

The dev shell is an Electron-based development environment that loads your plugin UI in a standalone window with mock backend APIs and hot-reload. It lets you develop and test your plugin without running the full Agent Mission Control application.

## Launching the Dev Shell

From your plugin directory:

```bash
npm run dev
```

This runs `amc-plugin dev`, which:

1. Reads your `manifest.json` to determine the plugin name, version, and entry points
2. Runs an initial TypeScript build
3. Opens an Electron window titled **"AMC Plugin Dev Shell - My Plugin v1.0.0"**
4. Loads your UI entry point (`dist/ui/index.html`) in a webview
5. If your plugin has a backend, activates it with a mock `PluginContext`
6. Starts watching `src/` and `manifest.json` for changes

## Hot-Reload

The dev shell uses [chokidar](https://github.com/paulmillr/chokidar) to watch your `src/` directory and `manifest.json`. When a file changes, it automatically:

1. Debounces rapid changes (300ms delay)
2. Recompiles TypeScript (`tsc`)
3. Copies non-TypeScript files from `src/ui/` to `dist/ui/` (HTML, CSS, images)
4. Triggers the appropriate reload action

### Reload Behavior by File Location

| Changed file | Action |
|---|---|
| `src/ui/*` | Webview reloads automatically -- you see the change instantly |
| `src/backend/*` | Console message: "Backend changed - restart dev shell to apply" |
| `manifest.json` | Manifest is re-validated |
| Any other `src/*` file | Treated as a UI change -- webview reloads |

::: warning
Backend changes require a restart of the dev shell. The backend module is loaded once at startup with `require()` and Node.js caches it. Kill the dev shell (close the window or Ctrl+C in the terminal) and run `npm run dev` again to pick up backend changes.
:::

## Mock Backend Context

When your plugin has a `backend.entryPoint` in the manifest, the dev shell creates a mock `PluginContext` and calls your `activate` function with it. The mock context logs all API calls to the console so you can observe what your plugin is doing.

### Mock API Behavior

| API | Mock behavior |
|---|---|
| **storage** | Persisted KV store -- survives restarts via `.amc-dev/amc-dev-storage.json` in your plugin dir (in-memory only when no data dir is set) |
| **db** | Faithful in-memory store -- `insert` assigns `id`/`created_at`/`updated_at`; `query` honors `where`, `orderBy` (`{ col: 'asc' | 'desc' }`), `limit`/`offset`; `getById`/`update`/`delete`/`deleteWhere` operate on real rows. Reads return copies |
| **settings** | Seeded from an `amc-dev-settings.json` dev config file next to your plugin; `getAll()`/`get(key)` read from it (empty when the file is absent) |
| **log** | Prints to the terminal with a `[plugin:your-id]` prefix |
| **events** | Fully functional in-memory `EventEmitter` |
| **sessions** | `create` returns a mock session ID; `getStatus` always returns `"running"`; `getMessages` returns `[]` |
| **ai** | Returns `"[AI mock] Response to: ..."` and `"[AI mock] Title: ..."` |
| **fs** | Rejects read/write/delete with an error; `exists` returns `false`; `listDir` returns `[]` |
| **http** | Passes through to real `globalThis.fetch` -- network requests work normally |
| **cron** | Logs registration but does not schedule; `isRegistered` returns `false` |
| **cli** | Logs handler registration but endpoints are not reachable |
| **sidebar** | Logs `setBadge` and `setItems` calls |
| **toast** | Logs toast messages and notifications to the console |

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

- **`.amc-dev/`** — a working directory the shell uses as the plugin `dataDir`. The KV `storage` API is flushed to `.amc-dev/amc-dev-storage.json`, so anything your plugin writes with `ctx.storage.set()` survives a dev-shell restart, just like the real SQLite-backed store in AMC.

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

The dev shell is designed for rapid UI development and basic backend testing. It does not replicate the full AMC runtime:

| Feature | Dev shell | Real AMC |
|---|---|---|
| UI rendering | Full (Electron webview) | Full (Electron webview) |
| Theme CSS variables | Injected by shell HTML | Injected by AMC |
| Storage | Persisted to `.amc-dev/` (JSON file) | SQLite `plugin_kv` (persistent) |
| DB | Faithful in-memory store (where/orderBy/limit) -- lost on restart | SQLite tables (persistent) |
| Settings | Seeded from `amc-dev-settings.json` | Configured in AMC settings UI |
| Sessions | Mock IDs, no real Claude process | Real Claude Code sessions |
| AI generation | Returns placeholder strings | Calls Anthropic API |
| Filesystem | Sandboxed to `dataDir` (real files; in-memory when no `dataDir`) | Sandboxed to plugin data dir |
| Cron scheduling | Logs only, no execution | Real cron scheduler |
| CLI endpoints | Logs only, not reachable | Reachable via control server |
| Notifications | Logs to console | Real OS notifications |
| Plugin permissions | Not enforced | Enforced at runtime |
| Sidebar badge/items | Logs to console | Updates AMC sidebar |

::: tip
For integration testing with real AMC APIs, install your built plugin into AMC directly. Use `npm run package` to create the `.amcplugin` file, then install it through Settings > Plugins > Install from file.
:::

## Window Configuration

The dev shell opens at **1200 x 800 pixels** with the title set to your plugin name and version. The window uses standard Electron configuration with:

- `contextIsolation: true`
- `nodeIntegration: false`
- `webviewTag: true`

This matches the security configuration used by AMC's own plugin webview host, ensuring your plugin behaves the same in both environments.
