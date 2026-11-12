# Manifest Reference

The `manifest.json` file is the central configuration for your plugin. It declares everything Omniscio needs to load, display, sandbox, and manage your plugin.

## Top-Level Structure

```json
{
  "plugin": { ... },
  "settings": [ ... ],
  "storage": { "collections": { ... } },
  "sdkVersion": "2.0.0",
  "ui": { ... },
  "keybindings": [ ... ],
  "process": { "allowedCommands": [ ... ] },
  "backend": { ... },
  "sessionTools": true,
  "mobile": false,
  "uiAnchors": [ ... ],
  "linkClaims": [ ... ],
  "uploadHosts": [ ... ],
  "usageActions": [ ... ],
  "permissions": [ ... ],
  "cli": { "endpoints": [ ... ] }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `plugin` | object | Yes | Plugin identity and metadata |
| `settings` | array | Yes | User-configurable settings (can be empty `[]`) |
| `storage` | object | Yes | Database collection schemas (can be `{ "collections": {} }`) |
| `sdkVersion` | string | Yes | Omniscio plugin-SDK contract the plugin needs, as a bare minimum (e.g. `"2.0.0"`) |
| `ui` | object | No | UI entry point and sidebar config |
| `keybindings` | array | No | Shortcuts your plugin registers, up to 20 — see [`keybindings`](#keybindings) |
| `process` | object | No | Programs your plugin may run through the host launcher — see [`process`](#process) |
| `backend` | object | No | Backend entry point and resource limits |
| `sessionTools` | boolean | No | Give your plugin's AI sessions the built-in tools. Off unless `true` — see [`sessionTools`](#sessiontools) |
| `mobile` | boolean | No | Let your plugin open on the owner's phone. Off unless `true` — see [`mobile`](#mobile) |
| `uiAnchors` | array | No | Controls in your page the in-app assistant may point at — see [`uiAnchors`](#uianchors) |
| `linkClaims` | array | No | Web URLs your plugin wants to handle, 1–20 entries of `{ "host", "path" }` — see [`linkClaims`](#linkclaims) |
| `uploadHosts` | array | No | The exact websites `http.uploadFile` may send files to, up to 10 — **required together with `network.upload`** — see [`uploadHosts`](#uploadhosts) |
| `usageActions` | array | No | The feature actions your plugin counts with `usage.record(action)`, up to 20 — see [`usageActions`](#usageactions) |
| `permissions` | array | No | Requested API permissions |
| `linkClaims` | array | No | External links your plugin handles, up to 20 — see [`linkClaims`](#linkclaims) |
| `uploadHosts` | array | No | Exact hostnames your plugin uploads to, up to 10; required with and by `network.upload` — see [`uploadHosts`](#uploadhosts) |
| `usageActions` | array | No | Action names your plugin reports for usage counts, up to 20, each 1-40 lowercase letters, digits or hyphens — see [`usageActions`](#usageactions) |
| `cli` | object | No | CLI endpoint declarations |

This is the WHOLE accepted surface: every key in the table is a key of the host's manifest schema (`src/shared/plugin-manifest-schema.ts:271-566`), and a key that is not there is silently stripped at parse time rather than rejected — so a typo or a field you remember from an older guide fails by doing nothing.

::: warning No `migrations`, no `cron` block
Earlier versions of this guide documented both. Neither is a host manifest key (`src/shared/plugin-manifest-schema.ts:271-566`); zod strips them, so a manifest that carries one validates and then behaves as if it were absent. Schema changes come from the automatic `ADD COLUMN` sweep described under [`storage`](#storage-block), and scheduled work is an automation with a schedule, not a manifest block. The `cron` PERMISSION is real and stays in the `permissions` array.
:::

## `linkClaims`

An array of `{ "host": "...", "path": "..." }` claims, up to 20. A claim says your plugin handles
links of that shape — so a link the owner clicks opens in your plugin (through its `open-link` CLI
endpoint) instead of the browser. `host` is an exact lowercase hostname; `path` starts with `/`, needs
at least one literal segment, and may carry `{placeholder}` segments. The owner can turn link opening
off per plugin, so treat the claim as a candidate, never a guarantee.

```json
{
  "linkClaims": [{ "host": "tasks.example.com", "path": "/projects/{projectId}" }]
}
```

## `uploadHosts`

An array of exact lowercase hostnames your plugin uploads files to, up to 10 — no scheme, port, path,
wildcard or IP address. It is tied to the `network.upload` permission in both directions: a plugin that
uploads must list its hosts, and a plugin that lists hosts must ask for `network.upload`. A manifest
that carries only one of the two is refused at parse time.

```json
{
  "permissions": ["network.upload"],
  "uploadHosts": ["upload.example.com"]
}
```

## `usageActions`

The names your plugin reports for usage counts, up to 20. Each is 1-40 characters of lowercase
letters, digits and hyphens, and no name may appear twice. They are what a usage row is keyed by, so
keep them stable once shipped.

```json
{
  "usageActions": ["file-export", "db-migrate"]
}
```

## `plugin` Block

```json
{
  "plugin": {
    "id": "my-plugin",
    "name": "My Plugin",
    "version": "1.0.0",
    "author": "Your Name",
    "description": "Does something useful",
    "icon": "icon.png",
    "category": "development",
    "license": { "type": "free" },
    "minAppVersion": "0.1.30",
    "tags": ["linter", "security"],
    "screenshots": ["https://example.com/shots/overview.png"],
    "links": { "homepage": "https://example.com", "support": "https://example.com/help" }
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique identifier, kebab-case (e.g. `"my-plugin"`) |
| `name` | string | Yes | Human-readable display name |
| `version` | string | Yes | Semver version (e.g. `"1.0.0"`) |
| `author` | string | Yes | Author name or organization |
| `description` | string | Yes | Short description shown in the marketplace |
| `icon` | string | Yes | **Path to an image in your package** (e.g. `"assets/icon.svg"`) — your real logo — **or** a [Lucide](https://lucide.dev/icons) icon name for a generic stock glyph. See [Plugin Icon](#plugin-icon). |
| `category` | string | Yes | One of: `planning`, `development`, `testing`, `devops`, `productivity`, `other` |
| `license` | object | Yes | `{ "type": "free" }`, `{ "type": "paid" }`, or `{ "type": "trial" }` |
| `minAppVersion` | string | No | Minimum Omniscio version required to run this plugin |
| `tags` | string[] | No | Discoverability keywords surfaced in marketplace search and shown as chips on the plugin card (up to 10 tags, 30 characters each) |
| `screenshots` | string[] | No | Gallery images for the marketplace detail page: up to 8 `http(s)` URLs you host, 2048 characters each. Any other value (a `data:` or `javascript:` URL, a 9th entry) fails validation |
| `links` | object | No | Support links for the detail page's Support tab: any of `homepage`, `support`, `privacy`, `contact`, `repository`, each an `http(s)` URL of at most 2048 characters |
| `requiresOrganization` | string | No | Show and enable the plugin only while the signed-in user's active Omniscio workspace is this organization id: letters, digits, `_` and `-`, up to 128 characters. A visibility gate, not a security boundary — lock any data the plugin reads on your own server (`src/main/services/plugin/plugin-org-gate.ts`) |

::: warning
The `id` field is permanent. It is used as the storage namespace, database prefix, and marketplace identifier. Changing it after publishing creates a new, separate plugin.
:::

::: tip Your listing is more than the manifest
The marketplace also renders the `README.md` next to `manifest.json` as the plugin's long description (`omniscio-plugin package` ships it from CLI 3.1), while `plugin.screenshots` and `plugin.links` fill the gallery and the Support tab. See [Publishing → What your listing shows](./publishing.md#what-your-listing-shows).
:::

### Plugin Icon

Your plugin's icon appears in the Marketplace card (40 × 40 px) and detail page (56 × 56 px). To include a custom icon:

1. Place an image file in your plugin's root directory (alongside `manifest.json`)
2. Reference it in the `icon` field:

```json
{
  "plugin": {
    "id": "my-plugin",
    "name": "My Plugin",
    "icon": "icon.png",
    ...
  }
}
```

**Supported formats:** PNG, JPG, SVG, WebP

**Recommended:** 128 × 128 px PNG with a transparent background. The image is displayed at 40 px in Marketplace cards and 56 px in the detail view, so a 128 px source gives crisp rendering on high-DPI screens.

When you upload your plugin to the Marketplace, Omniscio automatically extracts the icon from
the package and hosts it.

#### The two forms, and why it matters

`icon` accepts either a **path to an image in your package** or a **[Lucide](https://lucide.dev/icons)
icon name**, and nothing about the field tells them apart:

| What you write | What every user sees |
|---|---|
| `"assets/icon.svg"` | **your logo** |
| `"newspaper"` | a generic stock glyph |

Measured on the live registry in September 2026: **16 of 17 published plugins shipped a stock
glyph**, several of them while carrying a perfectly good logo inside their own package that was
never used. If you have a logo, point `icon` at it.

#### Use both fields

Set `plugin.icon` to your image **and** keep a Lucide name in `ui.sidebar.icon`. That name is
the fallback the host draws when the image cannot be loaded — offline, or before the plugin
catalogue has finished loading. A plugin with only a path and no fallback name shows a puzzle
piece in those moments.

```json
{
  "plugin": { "icon": "assets/icon.svg" },
  "ui": { "sidebar": { "icon": "sparkles" } }
}
```

#### What `omniscio-plugin validate` tells you

- **Warns** when `icon` is a Lucide name — you will ship a stock glyph. Not an error; a stock
  glyph is a legitimate choice, just rarely the intended one.
- **Fails** when `icon` is a path to a file that is not actually in your package. The
  Marketplace's extractor skips a missing icon and publishes anyway, so this check is the only
  place that problem is ever visible. A file that exists in your project but sits outside what
  `package` ships (for a TypeScript plugin: `dist/`, `assets/` and the README) fails too, so
  keep your logo under `assets/`.
- **Fails** on a path that escapes the package (`../`, an absolute path, a drive letter, or a
  URL scheme).

`omniscio-plugin create` scaffolds `assets/icon.svg` with a placeholder for you to replace. It writes
a placeholder only for an `.svg` path inside the project; for another format such as `.png`,
add the file yourself. It refuses a path that escapes the project, and a path outside the folders
the package ships (`assets/` for TypeScript templates; `assets/`, `ui/` and `prompts/` for `webview`),
so `create` and `validate` always agree.

## `settings` Array

Declare user-configurable settings that appear in Omniscio's Settings > Plugins > Your Plugin panel. Each setting maps to a key that your plugin reads via `ctx.settings.get(key)` (backend) or `amc.settings.get(key)` (frontend).

### Setting Types

#### Toggle

```json
{
  "key": "autoSync",
  "label": "Auto-sync",
  "description": "Sync data automatically on startup",
  "type": "toggle",
  "default": true
}
```

#### Text

```json
{
  "key": "apiEndpoint",
  "label": "API Endpoint",
  "description": "Base URL for the external API",
  "type": "text",
  "default": "https://api.example.com"
}
```

#### Password

```json
{
  "key": "apiKey",
  "label": "API Key",
  "description": "Your API key (stored encrypted)",
  "type": "password",
  "default": ""
}
```

#### Number

```json
{
  "key": "maxRetries",
  "label": "Max Retries",
  "description": "Number of retry attempts",
  "type": "number",
  "default": 3,
  "min": 1,
  "max": 10
}
```

#### Select

```json
{
  "key": "outputFormat",
  "label": "Output Format",
  "type": "select",
  "default": "json",
  "options": [
    { "value": "json", "label": "JSON" },
    { "value": "csv", "label": "CSV" },
    { "value": "markdown", "label": "Markdown" }
  ]
}
```

### Setting Fields Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | Unique key used to read the setting value |
| `label` | string | Yes | Display label in the settings UI |
| `description` | string | No | Help text shown below the label |
| `type` | string | Yes | One of: `toggle`, `select`, `text`, `number`, `password` |
| `options` | array | Only for `select` | Array of `{ value, label }` objects |
| `default` | any | Yes | Default value when the user has not changed the setting |
| `min` | number | No | Minimum value (for `number` type) |
| `max` | number | No | Maximum value (for `number` type) |
| `agentWritable` | boolean | No | Let an outside (control-server) change to this setting apply at once; without it the change waits for the person's approval. See [Outside writes](#outside-writes-agentwritable) |

## `storage` Block

Declare database collections your plugin uses. Each collection has named columns with types. Omniscio creates SQLite tables for each collection, namespaced to your plugin.

```json
{
  "storage": {
    "collections": {
      "tasks": {
        "columns": {
          "title": "text",
          "priority": "integer",
          "metadata": "json",
          "score": "real"
        },
        "indexes": ["priority", "title"]
      },
      "logs": {
        "columns": {
          "message": "text",
          "level": "text"
        }
      }
    }
  }
}
```

### Column Types

| Type | SQLite Type | Description |
|---|---|---|
| `text` | TEXT | String values |
| `integer` | INTEGER | Whole numbers |
| `real` | REAL | Floating-point numbers |
| `json` | TEXT (JSON) | Serialized JSON objects/arrays |

### Indexes

The optional `indexes` array lists column names to index for faster queries. Each entry creates a standard B-tree index on that column.

The optional `uniqueIndexes` array declares **composite-unique tuples** — each inner array is a set
of columns that together must be unique:

```json
{
  "findings": {
    "columns": { "scan_id": "text", "category": "text", "detail": "json" },
    "uniqueIndexes": [["scan_id", "category"]]
  }
}
```

Omniscio emits a real `CREATE UNIQUE INDEX` per tuple, de-duplicating existing rows (keep-latest) the
first time it creates one. This is not decoration: [`ctx.db.upsert()`](../api/db) performs an
`INSERT ... ON CONFLICT (<tuple>) DO UPDATE`, so a tuple declared here is what makes that call
atomic. An upsert against an undeclared tuple raises a SQLite error rather than silently inserting
a duplicate.

`id`, `created_at` and `updated_at` are managed by Omniscio and may not be declared as columns.

::: tip
Every collection automatically gets an `id` column (TEXT, primary key), a `created_at` column, and an `updated_at` column. You do not need to declare these.
:::

### Outside writes: `agentWritable`

Omniscio's local control server — the API every AI agent session on the computer can reach — has
generic routes that write plugin tables (`POST`, `PATCH` and `DELETE /plugins/:id/db/:collection`).
On Omniscio builds that carry the plugin-table fence, those writes are refused (HTTP 403,
`PLUGIN_COLLECTION_NOT_AGENT_WRITABLE`) for every key unless the table opts in:

```json
"notes": {
  "columns": { "title": "text", "body": "text" },
  "agentWritable": true
}
```

- **Opt in only plain data an agent may freely edit** — never a table your plugin acts on: a command
  queue, a job list, a rule it runs.
- **Your own backend and panel write every table as before.** The fence covers only the outside door.
- **Reads are a separate fence** — see [`agentReadable`](#private-rows-agentreadable) below.
- **Older Omniscio builds ignore the key** and leave every table writable from outside, so never rely
  on it for safety: take commands through the [command channel](./commands) instead.

The same key on a setting (`settings[].agentWritable`) lets an outside settings change apply at
once. Without it the change waits for the person's approval card, and a `password` setting can never
be changed from outside.

### Private rows: `agentReadable`

The same control server has generic routes that READ plugin tables. Those reads are open by
default, so every AI agent session on the computer can list a plugin's rows. Mark a table
`agentReadable: false` when its rows are not the person's to hand to every agent — access tokens, AI
session ids, private notes, unpublished drafts:

```json
"pull_requests": {
  "columns": { "title": "text", "detailJson": "json" },
  "agentReadable": false
}
```

- **What it refuses.** `GET /plugins/:id/db/:table` and the single-row read answer `403`
  (`PLUGIN_COLLECTION_NOT_AGENT_READABLE`) to every caller but the person's own install-wide key.
  It refuses outside writes too: a caller that may not read the rows may not change them.
- **Your panel and backend read normally** — they use the in-process bridge, never those routes.
- **This key is the one that fails OPEN on an older host.** A build that predates it drops the key
  and serves the rows to agents anyway; `agentWritable` fails the other way (closed). So never rely
  on it for safety on an older Omniscio — keep what must stay private out of tables that older
  builds read, or gate it behind your own endpoints.
- **It does not cover your own CLI endpoints.** Rows you serve through
  `/plugins/:id/cli/…` are fenced by the endpoint's own `agentReadable` key (see
  [Actions an agent may not call](#actions-an-agent-may-not-call-agentreadable)), and the
  key-value store has its own fence below.

### Read-only columns: `cliReadOnlyColumns`

On a table that is `agentWritable`, list the columns an outside write must never set:

```json
"rules": {
  "columns": { "title": "text", "enabled": "integer", "spend_cap": "integer" },
  "agentWritable": true,
  "cliReadOnlyColumns": ["enabled", "spend_cap"]
}
```

- **An outside `POST` or `PATCH` that sets a listed column is refused** (HTTP 403). The other
  columns stay writable, and your own backend and panel write every column as before.
- **List every column and the table is append-only from outside** — `DELETE` is refused too, so an
  audit trail cannot be erased through the control server.
- Up to 64 entries, and each must be a column declared in `columns`. `omniscio-plugin validate` refuses an
  undeclared name with the same message Omniscio gives.

### The key-value store: `storage.kv`

`ctx.storage` keys are refused to outside writes (`PUT` and `DELETE /plugins/:id/kv/...`, HTTP 403)
unless the store opts in:

```json
"storage": { "collections": {}, "kv": { "agentWritable": true } }
```

Reads are open unless you fence them. A plugin keeps more than preferences in `ctx.storage` — a
GitHub session, unpublished review drafts, private notes — and every AI agent session on the
computer can reach the read routes. Two keys keep that data to the person:

```json
"storage": {
  "collections": {},
  "kv": {
    "agentReadable": false,
    "agentHidden": ["connection", "draft:*"]
  }
}
```

| Key | What it does |
|---|---|
| `agentReadable` | `false` refuses BOTH read routes for the whole store to every caller but the person's own install-wide key. Absent or `true` leaves the store readable. |
| `agentHidden` | Up to 64 keys, each 1 to 256 characters, hidden while the rest of the store stays readable. A trailing `*` matches a key PREFIX (`draft:*` hides every `draft:` key). |

- **The single-key read is refused** (`403`, `PLUGIN_KV_NOT_AGENT_READABLE`). The key is not
  fetched, so the refusal is no existence signal.
- **A hidden key is not writable from outside either**, even on a store that opted writes in with
  `agentWritable` (`403`, `PLUGIN_KV_NOT_AGENT_WRITABLE`) — otherwise an agent could erase the value
  it may not read.
- **The list omits hidden keys** and returns every other key with its value.
- **Your own backend and panel read normally** — they use the in-process bridge.
- **These keys fail OPEN on an older Omniscio**, like every `agentReadable` key: the key is stripped
  and the values are served to agents anyway. `ctx.secrets` remains the encrypted store for a real
  secret.

### Command tables: `commandTableWaiver`

`omniscio-plugin validate`, `preflight` and `publish` fail when a table can hold a runnable command — an
instruction column (`type`, `command`, `action`, `op`, `kind`, `method`…), an argument column
(`payload`, `args`, `params`, `input`, `body`, `data`, `prompt`, also as `payloadJson` /
`payload_json`) and a status column (`status`, `state`, `*_status`). See
[Panel commands](./commands) for the safe pattern and the [CLI reference](../reference/cli#command-tables)
for the full rule.

If such a table is genuinely safe — say, a read-only history of finished commands the backend never
reads back — say why in the table itself:

```json
"command_log": {
  "columns": { "type": "text", "payload": "json", "status": "text" },
  "commandTableWaiver": "History of finished commands for the activity view; the backend never reads it back."
}
```

The waiver must be 20 to 500 characters. Marketplace review sees it; Omniscio ignores it. A waiver
never covers a table that is also `agentWritable`.

### Changing a schema

There is no migration runner and no applied-migrations ledger. When your plugin's `version`
increases, Omniscio diffs `storage.collections` against the live table and **adds any column that
is missing**. So a new column appears if you declare it here and bump `plugin.version`. Renames and
drops are not possible through any Omniscio path; migrate the data yourself in `onEnable` if you
need one.

A `migrations` array is NOT a host manifest key (`src/shared/plugin-manifest-schema.ts:271-566`):
zod strips it, so a manifest carrying one validates and the block does nothing.

## `ui` Block

Declares the frontend entry point, sidebar appearance, and how Omniscio frames your plugin.

```json
{
  "ui": {
    "entryPoint": "dist/ui/index.html",
    "sidebar": {
      "title": "My Plugin",
      "icon": "puzzle"
    },
    "hideProjectPanel": false,
    "hideSessionsPane": false,
    "sessions": {
      "label": "My Plugin sessions",
      "contextTemplate": "You are working inside {{projectName}} on {{date}}.",
      "showDivider": true,
      "suggestedPrompts": [
        { "label": "Audit", "prompt": "Audit this project for security issues" }
      ]
    }
  }
}
```

| Field | Type | Required | Max | Description |
|---|---|---|---|---|
| `entryPoint` | string | No | 500 | Path to the HTML file (relative to plugin root) |
| `sidebar.title` | string | No | 50 | Label shown in Omniscio's sidebar |
| `sidebar.icon` | string | No | 50 | [Lucide](https://lucide.dev/icons) icon name |
| `overlay.entryPoint` | string | No | 500 | A separate always-on-top window Omniscio opens on enable |
| `settingsPanel.entryPoint` | string | No | 500 | Your own settings screen, opened from a "Settings" button on your plugin's card. The `settings` fields still render |
| `widget.entryPoint` | string | No | 500 | The 320 x 256 popover Omniscio opens when your titlebar widget is clicked. Needs `chrome` and `chrome.widget`. **Plugin-relative only**, see below |
| `windows.<key>.entryPoint` | string | No | 500 | A pop-out surface you open with `window.open(key)`. Up to 4; keys are lowercase letters, digits and hyphens (≤ 40); optional `title` (≤ 120), `width` and `height` (200–10000 px) |
| `hideProjectPanel` | boolean | No | — | Suppress Omniscio's project panel while your view is open. **Half of "full width" — see below** |
| `hideSessionsPane` | boolean | No | — | Suppress the plugin sessions pane. **The other half — set it alongside `hideProjectPanel`** |
| `sessions.label` | string | No | 100 | Heading above your plugin's session list. Defaults to the plugin name |
| `sessions.contextTemplate` | string | No | 5000 | Extra context appended to Omniscio's built-in primer for every session on your plugin's project |
| `sessions.showDivider` | boolean | No | — | Defaults to `true` |
| `sessions.suggestedPrompts` | array | No | 4 items | Tappable prompts under the session list (`label` ≤ 60, `prompt` ≤ 2000) |
| `sessions.realProjectContext` | boolean | No | — | Add your plugin's standing context to sessions in the user's REAL projects that your plugin holds a workspace grant for. See below |

::: warning Every entry point must stay inside your package
`omniscio-plugin validate` applies Omniscio's own entry-path rule to `ui.entryPoint` and the
`overlay`, `settingsPanel`, `widget`, `windows` and `backend` entry points. A path fails if it:

- is blank, longer than 500 characters, or contains a tab or line break;
- starts with `/` or `\`, a drive letter (`C:`) or a URL scheme (`file:`, `https:`…);
- has a `..` segment, with either separator.

`%2e`, `%2f` and `%5c` count as `.`, `/` and `\`, so `%2e%2e/x.html` fails too. A filename with
two dots, such as `my..page.html`, is fine. Omniscio refuses to load a plugin that breaks this rule.
:::

`widget.entryPoint` is the 320 x 256 popover behind a [titlebar widget](../api/widget). It must be a
plugin-relative path: not blank, no URL or scheme, no leading `/` or `\`, no drive letter and no
`..` segment — the same rule as every other entry point above, and it is what Omniscio
checks at install, so a bad path fails `omniscio-plugin validate` rather than showing a blank frame.
Without it, clicking the widget opens your plugin's own panel. `chrome.widget` is only valid beside
an explicit `chrome` permission. `omniscio-plugin validate` also checks that the file exists and that
`package` will ship it.

`entryPoint` and `sidebar` are **both optional** — a `ui` block is useful for its side effects
alone, e.g. `{ "hideProjectPanel": true }`. (Earlier SDK versions required them, so a manifest Omniscio
installed happily could fail `omniscio-plugin validate`.)

::: warning "Full width" is two flags, not one
The column Omniscio clears for you has **two** owners, and each has its own opt-out. Hiding one
alone just hands the column to the other, so a plugin that wants the full width must set both:

```json
{ "ui": { "hideProjectPanel": true, "hideSessionsPane": true } }
```

`hideSessionsPane` was missing from this SDK's schema until 2026-08-21. Because the schema is
non-strict, a manifest declaring both **kept `hideProjectPanel` and silently dropped its
sibling** on the way through `omniscio-plugin validate` and `package` — so the plugin looked
correct dev-loaded and un-full-widthed itself once packaged. If you worked around that by
giving up on full width, you can stop.
:::

### The Sessions pane and the `[list | Sessions]` toggle

Omniscio shows your plugin's AI sessions beside its screen when the manifest declares at least one
`cli.endpoints` entry **or** a `ui.sessions` block. The `ui.sessions` block alone is enough, so a
plugin whose AI actions live in Omniscio's own control server rather than in its own `cli` block
still gets the pane. `ui.hideSessionsPane: true` turns the pane off either way.

A plugin that also shows its own sidebar list (`ui.sidebar`, with no `hideProjectPanel`) never gets
two columns. Omniscio puts both in **one** column with the standard tab switch at the top,
`[<sidebar.title> | Sessions]`, the same toggle Mind Maps and Mission Control use:

- The list tab comes first and is the default. It is labelled with `sidebar.title`, or your plugin's
  name when the sidebar has no title.
- The Sessions tab carries the live running / needs-you / error count for your plugin's sessions.
- Omniscio remembers the chosen tab for each plugin until the app restarts.
- While one of your plugin's chats has the screen, the column shows the Sessions tab, so the
  `Show <plugin>` way back stays in view. Picking the list tab then brings your plugin back.

A plugin with only a sidebar list, or only sessions, keeps a single column exactly as before.

`contextTemplate` supports single-pass `{{placeholder}}` substitution. Available variables are
`date`, `projectName`, `sessionName`, `workDir` and `pluginName`. A whitespace-only template is
treated as absent rather than rejected.

`entryPoint` and `sidebar` are both **optional**, matching Omniscio. A `ui` block carrying only
`hideProjectPanel` or `sessions` is valid -- those are useful without a webview. Omit the whole
block if you need none of them.

`contextTemplate` is folded *after* Omniscio's built-in plugin context, so your text adds to the
system context rather than replacing it.

`sessions.realProjectContext: true` reaches further: when a session starts in one of the user's real
projects, and your plugin holds a workspace grant on that project, Omniscio calls your plugin's
`GET context` CLI action and adds the text it returns. Declare that endpoint as a plain read (or
`"safe": true`) — an action that needs the person's approval is never called here. A block over
5,000 characters, or one that takes longer than 1.5 seconds, is left out rather than cut short.

## `keybindings` Array

Registers keyboard shortcuts your plugin owns (`src/shared/plugin-manifest-schema.ts:453`).

```json
{
  "keybindings": [
    { "shortcut": "CommandOrControl+Shift+K", "commandId": "open-panel", "label": "Open my panel" }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `shortcut` | string | Yes | The accelerator, 1–100 characters (`CommandOrControl+Shift+K`) |
| `commandId` | string | Yes | Letters, digits and hyphens only (1–100) — the command your plugin handles |
| `label` | string | Yes | Human-readable name shown in the shortcut UI (1–200) |

At most **20** entries; a longer list fails validation. `omniscio-plugin validate` checks every one of
these rules (SDK 3.2 and earlier dropped the block unchecked, so a bad `commandId` only failed at
install).

## `process` Block

Declares what your plugin may run through the host launcher (`ctx.process` from a backend,
`window.Omniscio.process` from your UI). Declare at least one of the two lists; a name may not be
in both.

```json
{
  "process": {
    "allowedCommands": ["git-lfs"],
    "pinnedPrograms": [
      { "name": "ffmpeg", "path": "bin/ffmpeg.exe", "sha256": "<64 hex>", "folder": "data", "platform": "win32" },
      { "name": "ffmpeg", "path": "bin/ffmpeg", "sha256": "<64 hex>", "folder": "data", "platform": "linux" }
    ]
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `allowedCommands` | string[] | One of the two | 1–20 bare command names found on the user's PATH — letters, digits, `.`, `_`, `+`, `-` only; no path separators, wildcards, whitespace or shell characters |
| `pinnedPrograms` | object[] | One of the two | 1–10 programs shipped in, or downloaded into, your own folder; each runs only while its bytes match the pin |

Each `pinnedPrograms` entry:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | The bare name you pass to `exec`/`spawn` (same rules as `allowedCommands`) |
| `path` | string | Yes | Path relative to the chosen folder; it may not climb out, and a link or junction pointing out is refused |
| `sha256` | string | Yes | 64 lowercase hex characters: the SHA-256 of the exact file |
| `folder` | `"data"` or `"install"` | No | `data` (default) is your plugin's data folder, where a backend can download a binary; `install` is your installed package |
| `platform` | `"win32"`, `"darwin"` or `"linux"` | No | Pin a different build per platform under one name; leave it out to pin one file everywhere |

Omniscio never runs your file in place. Before the first start it copies the file to a folder
your plugin cannot write, checks the copy's fingerprint, makes it read-only, and runs that copy.
The copy is checked in full again on its first start after each app restart. A missing file, a
changed file, a path outside your folder, and a name pinned only for another platform are each
refused with a plain sentence before anything starts. To update a binary, ship the new hash in
your manifest; the old copy is removed. The consent card lists every pinned program by name.

General-purpose interpreters and shells (`node`, `python`, `bash`, `powershell`, `cmd`) and
command launchers (`git`, `ssh`, `make`, `env`, `xargs`) are refused by name: allowing one would
let the plugin run arbitrary code, so the host rejects the manifest rather than trusting the plugin.
The full list is `INTERPRETER_DENYLIST` in `src/shared/plugin-manifest-schema.ts:68-127`. The SDK
ships the same list, generated from that file, as `PROCESS_INTERPRETER_DENYLIST`, and
`omniscio-plugin validate` applies it the way Omniscio does: case does not matter, and a `.exe` or
`.cmd` suffix is ignored, so `NODE.EXE` and `bash.cmd` are refused too. SDK 3.2 and earlier
dropped the `process` block unchecked.

## `backend` Block

Declares the backend entry point and optional resource limits.

```json
{
  "backend": {
    "entryPoint": "dist/backend/index.js",
    "resourceLimits": {
      "memoryMb": 128
    }
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `entryPoint` | string | Yes | Path to the compiled JS file exporting `activate`. Must stay inside your package — see the entry-path rule under the `ui` block |
| `resourceLimits.memoryMb` | number | No | Memory limit for the backend worker (in MB) |
| `timeouts` | object | No | Deadlines for your backend's hooks, in milliseconds — see below |

Omit the entire `backend` block if your plugin is UI-only.

### Hook deadlines: `timeouts`

A backend with a slow cold start, or a CLI action that legitimately runs long, can raise its own
deadlines:

```json
{
  "backend": {
    "entryPoint": "dist/backend/index.js",
    "timeouts": { "activateMs": 45000, "cliDispatchMs": 60000 }
  }
}
```

| Key | Default | What it bounds |
|---|---|---|
| `activateMs` | 20,000 | Loading your backend and its `ready` signal. Missing it stops the worker |
| `onEnableMs` | 10,000 | `onEnable` |
| `onDisableMs` | 5,000 | `onDisable` |
| `onShutdownMs` | 5,000 | `onShutdown` |
| `onSettingsChangedMs` | 5,000 | `onSettingsChanged` |
| `onAppReadyMs` | 10,000 | `onAppReady` |
| `cliDispatchMs` | 30,000 | One CLI endpoint call, before the caller gets a 504 |

Each value must be a positive whole number — `omniscio-plugin validate` refuses `0`, a negative, a
fraction or a string, as Omniscio does. Omniscio then clamps every value to 1,000–60,000, and a key
you leave out keeps its default.

## `permissions` Array

List the permissions your plugin needs. Omniscio shows these to the user during installation.

```json
{
  "permissions": ["storage", "sessions", "ai", "network", "cron", "cli", "notifications", "rss"]
}
```

See [Permissions](./permissions) for a detailed breakdown of what each permission grants.

## `cli` Block

Declare CLI endpoints that external tools can call through Omniscio's control server.

```json
{
  "cli": {
    "endpoints": [
      {
        "method": "GET",
        "path": "status",
        "description": "Get plugin status",
        "auth": true
      },
      {
        "method": "POST",
        "path": "trigger",
        "description": "Trigger a plugin action",
        "auth": true
      }
    ]
  }
}
```

| Field | Type | Description |
|---|---|---|
| `method` | string | HTTP method: `GET`, `POST`, `PUT`, or `DELETE` |
| `path` | string | Endpoint path (appended to `/plugins/<plugin-id>/`) |
| `description` | string | Human-readable description |
| `auth` | boolean | Whether the endpoint requires bearer-token authentication |
| `requiresConfirmation` | boolean | A person must approve the call before it reaches your handler |
| `safe` | boolean | A write that may run without asking; cannot be combined with `requiresConfirmation` |
| `preview` | `"two-step"` or `"card"` | Lets the approval card show what the action will do; only with `requiresConfirmation`, and only together with `previewPath` |
| `previewPath` | string | The read-only endpoint Omniscio asks for the preview: another endpoint of this plugin with the same method, marked `safe`, not `requiresConfirmation` |
| `agentReadable` | boolean | Keep this action's answers away from AI agents. `false` refuses every call that carries an agent credential (HTTP 403, `PLUGIN_CLI_NOT_AGENT_READABLE`); the person's own install-wide key still runs it. See [Actions an agent may not call](#actions-an-agent-may-not-call-agentreadable) |

Requires the `cli` permission.

### Actions an agent may not call: `agentReadable`

An action that returns what a private table holds — or any other data that is not the person's to
hand to every agent — can be kept away from agent credentials:

```json
{
  "method": "GET",
  "path": "secret-report",
  "description": "The personal report this plugin keeps",
  "auth": true,
  "agentReadable": false
}
```

- **What it refuses.** A call carrying any credential except the person's own install-wide key is
  answered `403` with the machine-readable code `PLUGIN_CLI_NOT_AGENT_READABLE`, before Omniscio
  replays a queued request or reaches your handler. A call the person approves is unaffected: their
  approval runs on their own key.
- **It covers the whole PATH, whatever the verb.** Your backend's handler is reached by path, so a
  fenced path called with another method is refused too rather than running the same handler. Use it
  for an action whose answer is private, not only for `GET`s.
- **Your own panel is unaffected** — it reaches your backend over the in-process bridge, never the
  control-server route, so a fenced action still works there.
- **It fails OPEN on an older Omniscio.** A build that predates the key strips it and serves the
  action to agents anyway. The same is true of every `agentReadable` key.

### Previews on the approval card

An action marked `requiresConfirmation` waits for a person. By default the approval card shows only the request. Add `"preview"` and a `"previewPath"` to show what the action will really do, written by your plugin. Both are only valid together with `requiresConfirmation`, and `previewPath` must name a second endpoint of your plugin with the same method, marked `"safe": true`. Omniscio refuses a manifest where it does not. Before the person approves, Omniscio calls that second endpoint and never the action itself, with the same query and body the action was asked with and the query key `amcPreview=card`; it must change nothing and answer `200` with `{ "card": { ... } }`. Omniscio never asks for a preview of an action that did not declare one.

| `preview` | What your handler must do |
|---|---|
| `"two-step"` | The first call to the action itself (no `confirm` field), made only after the person approves, changes nothing and answers `200` with `{ "requiresConfirmation": true, "confirmToken": "<token>", "card": { ... } }`. If that `card` is the same as the one the person saw, Omniscio repeats the request with `"confirm": "<token>"` added to the body. Answer that call as the real action. |
| `"card"` | When the person approves, Omniscio asks the preview endpoint once more and, if the card is the same, sends the original request with the query key `amcApproved=1`; run the action once and record it as confirmed. The query key `amcSessionName` carries the asking session's name, when there is one. |

Omniscio removes every query key that starts with `amc` from a caller's request before your handler sees it, so only Omniscio can set these keys. A plugin that declares `preview` must keep the preview endpoint free of side effects and safe to run twice. A standing "Always allow" never runs an action that declared a preview: it always waits for a person, so Omniscio offers no "Always allow" control on that action's card.

The `card` object (every string is shown as plain text, capped, and stripped of control characters; unknown fields are dropped):

| Field | Meaning |
|---|---|
| `title` | Required, 120 characters. What will happen, as a short sentence. |
| `verb` | 40 characters. What the plugin says it will do, for example `Merge PR #10823`. Omniscio shows it as "Plugin says: Merge PR #10823" inside the plugin's own box; it is never the label of the Approve button. |
| `risk` | `"danger"` or `"normal"`. `danger` adds the line "The plugin marks this action as risky." inside the plugin's box. It does not change the button: Omniscio colours Approve red only when the request is a `DELETE`. |
| `consequence` | 300 characters, shown above the button. |
| `rows` | Up to 12 of `{ label, value, mono?, volatile? }`. Set `volatile: true` on a row that changes by itself (a running-check count); it is left out of the "has this changed" comparison. |
| `body`, `quote`, `item`, `details` | The card-kind layout: bold text only in `body`, a verbatim `quote`, an `item` block (`state`, `title`, `number`, `meta`, `excerpt`) and a fold-out `details` (`summary`, `note`, `text`, and the optional `oneLine`, `personal` and `marks` below). |
| `done` | Returned with the answer to the real call: `{ rows, link? }` where `link` is `{ label, url }` and `url` must be `https`. The card shows it as what actually ran. |

What the person sees around your card is written by Omniscio, not by your plugin. Above everything you supply, the card shows your plugin's name and id, the exact request that Approve will run (`METHOD /plugins/<id>/cli/<path>`), who asked, and the query arguments and request body that will be sent. Your `title`, `verb`, `rows`, `consequence` and the rest sit below that, in a box labelled "From the plugin". The Approve button always says "Approve" ("Approve with these changes" when the card changed), and the pane title is Omniscio's own words. A field longer than its limit is cut, and the card says so in place with "… cut, N more characters", so write to the limits.

The `details` fold-out says what the AI will be told. Add `oneLine` (160 characters) and Omniscio shows it above the fold-out as "The AI will be told: ...", readable without opening anything. The fold-out stays closed unless it includes personal data: set `personal: true` and list the names to highlight in `marks` (up to 10 short strings, matched exactly), and Omniscio shows a badge, opens the fold-out for the person and highlights those parts. Omniscio also checks the text itself for email addresses and treats them the same way, so a plugin that forgets the flag still gets the box opened. Names are only highlighted when you list them.

If the action is refused, answer with a failure status and `{ "error": "<one plain sentence>" }`; Omniscio shows that sentence (300 characters, plain text) as the plugin's reason.

## `sdkVersion`

The Omniscio plugin-SDK **contract** your plugin needs — not the version of the `@omniscio/plugin-sdk` package. Omniscio checks it against the contract it provides, and a plugin it cannot satisfy is marked incompatible and loses its toolbar button.

```json
{
  "sdkVersion": "2.0.0"
}
```

Write a bare version. A bare version means "this contract or newer", so your plugin keeps loading as Omniscio moves forward. A caret range means "this major only": it breaks on the next contract major, and `"^3.0.0"` — what CLI 3.0.0 scaffolded — is refused outright by Omniscio's `2.0.0` contract. The scaffolder writes `"2.0.0"`, the contract Omniscio has provided since v0.1.103, and leaves the SDK dependency in `package.json` as an ordinary npm range.

## `sessionTools`

Gives the AI sessions your plugin starts (`ctx.sessions.create` or `Omniscio.session.create`) the
built-in tools: Read, Grep, Bash, Write, Edit, WebFetch and the rest.

```json
{
  "sessionTools": true
}
```

- **Off unless you declare it.** Without `true`, a session your plugin starts can only answer in
  text. That is the right default for a plugin that answers from documents it did not write.
- **Declare it only if your sessions must change files or run commands** — for example, a plugin
  whose session edits code and pushes it.
- **The user sees it at install** as "Agent Sessions". Adding it in an update asks them to approve
  again.
- It must be `true` or `false`; anything else fails `omniscio-plugin validate`.

## `mobile`

Lets your plugin open on the owner's phone (through Omniscio's Mobile Access) and in the desktop
Phone Simulator.

```json
{
  "mobile": true
}
```

- **Off unless you declare it.** Without `true`, your plugin shows "only available on the desktop
  app" on a phone.
- **It runs walled off.** On the phone your `ui.entryPoint` page loads in a sandboxed frame with its
  own throwaway origin: it cannot see Omniscio's sign-in, storage or page, and it can reach only its
  own files under the folder of `ui.entryPoint`. Every `Omniscio` call keeps the permissions you
  declared, minus the actions a phone always refuses (native dialogs, the file system, spawning).
- **Browser storage is temporary.** `localStorage` and `sessionStorage` work but are cleared when the
  page closes, and `indexedDB` is unavailable — keep anything that must last in `Omniscio.storage`.
- **No outside network.** The page may fetch only its own files; call your backend through the bridge.
- **Test it without a phone:** load your plugin in Developer Mode, turn it on, then open the Phone
  Simulator (Settings → Plugins → Developer Mode, or Settings → Mobile Access). Press F12 there to
  inspect the phone page.
- The owner can turn all phone plugins off in Settings → Mobile Access → Devices.
- It must be `true` or `false`; anything else fails `omniscio-plugin validate`.

## `uiAnchors`

Lets the in-app assistant point at buttons and other controls inside your plugin page. Without it the
assistant sees your plugin as one blank area.

```json
{
  "uiAnchors": [
    {
      "id": "open-file",
      "label": "Open file",
      "description": "Opens the file picker so the user can choose a PDF.",
      "kind": "button",
      "when": "always"
    }
  ]
}
```

- **Two halves.** List the control here, and put `data-ui-anchor="open-file"` on the matching element in
  your page. The two must use the same `id`; a marker with no entry here is ignored.
- **Fields.** `id` is lowercase letters, digits and single hyphens, up to 48 characters, and unique.
  `label` (80), `description` (300) and the optional `when` (120) are one line of plain text each, with no
  line breaks. `kind` is one of `button`, `link`, `input`, `toggle`, `tab`, `menuitem`, `row`, `region`,
  `composite`, `dialog`, `panel`, `display`, `select`, `form`. At most 64 entries.
- **The assistant reads these words, not your page.** It sees your `label`, `description` and `when`, marked
  as written by your plugin. Write them as plain descriptions of the control, never as instructions.
- **Names.** Omniscio names each control `plugin:<your plugin id>:<id>`, so your ids can never collide with
  the app's or another plugin's. You never write the full name, and the whole name must fit 120 characters:
  a long plugin id leaves less room for the `id`.
- **When it works.** Only while your plugin's pane is on screen and loaded, on the desktop app. The phone
  frame is not covered.
- **Older apps.** An app that predates this key ignores it and loads your plugin as before; the
  assistant just cannot point inside it.
- It must be an array of valid entries; anything else fails `omniscio-plugin validate`.

## `linkClaims`

Links your plugin can open itself. When the person switches **Open links in this plugin** on for your plugin (on its card in Settings → Plugins, off by default), a plain click on a matching link in session output opens it in your plugin instead of the browser.

```json
{
  "linkClaims": [
    { "host": "github.com", "path": "/{owner}/{repo}/pull/{number}" },
    { "host": "github.com", "path": "/{owner}/{repo}/issues/{number}" }
  ]
}
```

| Field | Rules |
|---|---|
| `host` | One exact lowercase domain with at least two labels, such as `github.com`. No wildcards, ports or user names. |
| `path` | Starts with `/` and has at least one literal segment, so a claim can never cover a whole site. A `{name}` segment matches exactly one path segment. |

Between 1 and 20 claims. Only `https` links match, and redirects are never followed.

**Receiving the link.** Omniscio calls your backend's CLI endpoint `POST open-link` with the body `{ "url": "<the clicked link>" }` — the link and nothing else, never the session or the text around it. Declare that endpoint in your [`cli` block](#cli-block) without an approval preview, answer within 10 seconds, and reply `{ "opened": true }` once your panel shows the item, or `{ "opened": false, "message": "<one plain sentence>" }` when it cannot, and the link opens in the browser instead.

Some clicks always go to the browser whatever the settings say: Ctrl, Cmd, Shift, Alt and middle click, the right-click **Open in browser** item, and any link two enabled plugins both claim. An Omniscio that predates `linkClaims` ignores the key.

## `uploadHosts`

The exact websites [`Omniscio.http.uploadFile`](../api/http) may send files to.

```json
{
  "permissions": ["network", "network.upload"],
  "uploadHosts": ["rupload.facebook.com"]
}
```

`network.upload` and `uploadHosts` go together: declaring one without the other fails validation. Each entry is one exact lowercase website name, such as `upload.example.com` — no scheme, port, path, wildcard or IP address. The person approves the list once, on your plugin's first upload. Up to 10 hosts.

## `usageActions`

The feature actions your plugin counts with `usage.record(action)`, so you can see which features people use.

```json
{
  "usageActions": ["export-pdf", "share-link", "ai-summary"]
}
```

At most 20 names, each 1 to 40 characters from `a-z`, `0-9` and `-`. `usage.record` with a name not on this list is ignored, never counted. Only a count is stored — no arguments, no content, nothing that identifies the person — and counts leave the computer on their own anonymous channel.

## `linkClaims`

Web URLs your plugin wants to handle, so Omniscio can offer it to the person when they are looking at
one of them — an "open this in my plugin" route.

```json
{
  "linkClaims": [
    { "host": "github.com", "path": "/{owner}/{repo}/issues/{number}" }
  ]
}
```

- **Shape.** Between 1 and 20 entries. Each names an exact `host` (a lowercase domain, no scheme, port,
  wildcard or user name, up to 253 characters) and a `path` that starts with `/` (up to 200).
- **Path segments.** Each segment is a literal (`issues`) or a `{placeholder}`, and at least one segment
  must be literal — a claim can never cover a whole site.
- **What it does not do.** It never makes the plugin handle the link automatically. The host uses it to
  offer your plugin as a destination side by side with the browser.
- It must be an array of valid entries; anything else fails `omniscio-plugin validate`.

## `uploadHosts`

The exact websites your plugin may send files to with `http.uploadFile`. This is the list the person
approves, once, on the first upload.

```json
{
  "permissions": ["network.upload"],
  "uploadHosts": ["rupload.facebook.com"]
}
```

- **Paired with the permission.** `network.upload` and `uploadHosts` go together: a plugin that uploads
  must list the websites it uploads to, and a plugin that lists them must ask for `network.upload`. A
  manifest with one and not the other is refused at load.
- **Exact names.** Up to 10 entries, each one exact lowercase website name such as
  `upload.example.com` — no scheme, port, path, wildcard or IP address.
- **Anything not listed is refused.** `http.uploadFile` to a site that is not in this list fails instead
  of sending.

## `usageActions`

The feature actions your plugin counts, so they appear in Omniscio's own usage and Feature Discovery
figures.

```json
{
  "usageActions": ["enrich-lead", "sync-board"]
}
```

- **Call them by these names.** `usage.record("enrich-lead")` counts; an action that is not in this list
  is never counted.
- **Shape.** Up to 20 names, each 1 to 40 characters of lowercase `a`–`z`, digits and `-`, with no
  duplicates.
- It must be an array of valid entries; anything else fails `omniscio-plugin validate`.

## Complete Examples

### Basic Template (UI Only)

```json
{
  "plugin": {
    "id": "my-widget",
    "name": "My Widget",
    "version": "1.0.0",
    "author": "Your Name",
    "description": "A simple UI widget",
    "icon": "layout-dashboard",
    "category": "productivity",
    "license": { "type": "free" }
  },
  "settings": [],
  "storage": { "collections": {} },
  "sdkVersion": "2.0.0",
  "ui": {
    "entryPoint": "dist/ui/index.html",
    "sidebar": { "title": "My Widget", "icon": "layout-dashboard" }
  }
}
```

### With-Backend Template

```json
{
  "plugin": {
    "id": "data-sync",
    "name": "Data Sync",
    "version": "1.0.0",
    "author": "Your Name",
    "description": "Syncs data from external sources",
    "icon": "refresh-cw",
    "category": "devops",
    "license": { "type": "free" }
  },
  "settings": [
    {
      "key": "syncInterval",
      "label": "Sync Interval (minutes)",
      "type": "number",
      "default": 15,
      "min": 1,
      "max": 60
    }
  ],
  "storage": {
    "collections": {
      "sync_records": {
        "columns": {
          "source": "text",
          "status": "text",
          "data": "json"
        },
        "indexes": ["source"]
      }
    }
  },
  "sdkVersion": "2.0.0",
  "ui": {
    "entryPoint": "dist/ui/index.html",
    "sidebar": { "title": "Data Sync", "icon": "refresh-cw" }
  },
  "backend": {
    "entryPoint": "dist/backend/index.js"
  },
  "permissions": ["storage"]
}
```

### Full Template

```json
{
  "plugin": {
    "id": "monitor-suite",
    "name": "Monitor Suite",
    "version": "1.0.0",
    "author": "Your Name",
    "description": "Full monitoring and automation suite",
    "icon": "activity",
    "category": "devops",
    "license": { "type": "free" }
  },
  "settings": [
    {
      "key": "enabled",
      "label": "Enable Monitoring",
      "type": "toggle",
      "default": true
    },
    {
      "key": "webhookUrl",
      "label": "Webhook URL",
      "type": "text",
      "default": ""
    },
    {
      "key": "alertLevel",
      "label": "Alert Level",
      "type": "select",
      "default": "warn",
      "options": [
        { "value": "info", "label": "Info" },
        { "value": "warn", "label": "Warning" },
        { "value": "error", "label": "Error only" }
      ]
    }
  ],
  "storage": {
    "collections": {
      "checks": {
        "columns": {
          "name": "text",
          "status": "text",
          "last_run": "text",
          "result": "json"
        },
        "indexes": ["name", "status"]
      }
    }
  },
  "sdkVersion": "2.0.0",
  "ui": {
    "entryPoint": "dist/ui/index.html",
    "sidebar": { "title": "Monitor Suite", "icon": "activity" }
  },
  "backend": {
    "entryPoint": "dist/backend/index.js"
  },
  "permissions": ["storage", "cron", "cli"],
  "cli": {
    "endpoints": [
      { "method": "GET", "path": "status", "description": "Get plugin status", "auth": true }
    ]
  }
}
```
