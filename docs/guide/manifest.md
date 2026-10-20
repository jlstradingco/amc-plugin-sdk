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
| `process` | object | No | Commands your backend may spawn — see [`process`](#process) |
| `backend` | object | No | Backend entry point and resource limits |
| `sessionTools` | boolean | No | Give your plugin's AI sessions the built-in tools. Off unless `true` — see [`sessionTools`](#sessiontools) |
| `permissions` | array | No | Requested API permissions |
| `cli` | object | No | CLI endpoint declarations |

This is the WHOLE accepted surface: every key in the table is a key of the host's manifest schema (`src/shared/plugin-manifest-schema.ts:182-453`), and a key that is not there is silently stripped at parse time rather than rejected — so a typo or a field you remember from an older guide fails by doing nothing.

::: warning No `migrations`, no `cron` block
Earlier versions of this guide documented both. Neither is a host manifest key (`src/shared/plugin-manifest-schema.ts:182-453`); zod strips them, so a manifest that carries one validates and then behaves as if it were absent. Schema changes come from the automatic `ADD COLUMN` sweep described under [`storage`](#storage-block), and scheduled work is an automation with a schedule, not a manifest block. The `cron` PERMISSION is real and stays in the `permissions` array.
:::

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

::: warning
The `id` field is permanent. It is used as the storage namespace, database prefix, and marketplace identifier. Changing it after publishing creates a new, separate plugin.
:::

::: tip Your listing is more than the manifest
The marketplace also renders the `README.md` next to `manifest.json` as the plugin's long description (`amc-plugin package` ships it from CLI 3.1), while `plugin.screenshots` and `plugin.links` fill the gallery and the Support tab. See [Publishing → What your listing shows](./publishing.md#what-your-listing-shows).
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

#### What `amc-plugin validate` tells you

- **Warns** when `icon` is a Lucide name — you will ship a stock glyph. Not an error; a stock
  glyph is a legitimate choice, just rarely the intended one.
- **Fails** when `icon` is a path to a file that is not actually in your package. The
  Marketplace's extractor skips a missing icon and publishes anyway, so this check is the only
  place that problem is ever visible. A file that exists in your project but sits outside what
  `package` ships (for a TypeScript plugin: `dist/`, `assets/` and the README) fails too, so
  keep your logo under `assets/`.
- **Fails** on a path that escapes the package (`../`, an absolute path, a drive letter, or a
  URL scheme).

`amc-plugin create` scaffolds `assets/icon.svg` with a placeholder for you to replace. It writes
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
- **Reads stay open.** Agents can still read every table.
- **Older Omniscio builds ignore the key** and leave every table writable from outside, so never rely
  on it for safety: take commands through the [command channel](./commands) instead.

The same key on a setting (`settings[].agentWritable`) lets an outside settings change apply at
once. Without it the change waits for the person's approval card, and a `password` setting can never
be changed from outside.

### Command tables: `commandTableWaiver`

`amc-plugin validate`, `preflight` and `publish` fail when a table can hold a runnable command — an
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

A `migrations` array is NOT a host manifest key (`src/shared/plugin-manifest-schema.ts:182-453`):
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
| `widget.entryPoint` | string | No | 500 | The popover Omniscio opens when your app-header widget is clicked |
| `windows.<key>.entryPoint` | string | No | 500 | A pop-out surface you open with `window.open(key)`. Up to 4; keys are lowercase letters, digits and hyphens (≤ 40); optional `title` (≤ 120), `width` and `height` (200–10000 px) |
| `hideProjectPanel` | boolean | No | — | Suppress Omniscio's project panel while your view is open. **Half of "full width" — see below** |
| `hideSessionsPane` | boolean | No | — | Suppress the plugin sessions pane. **The other half — set it alongside `hideProjectPanel`** |
| `sessions.label` | string | No | 100 | Heading above your plugin's session list. Defaults to the plugin name |
| `sessions.contextTemplate` | string | No | 5000 | Extra context appended to Omniscio's built-in primer for every session on your plugin's project |
| `sessions.showDivider` | boolean | No | — | Defaults to `true` |
| `sessions.suggestedPrompts` | array | No | 4 items | Tappable prompts under the session list (`label` ≤ 60, `prompt` ≤ 2000) |

::: warning Every entry point must stay inside your package
`amc-plugin validate` applies Omniscio's own entry-path rule to `ui.entryPoint` and the
`overlay`, `settingsPanel`, `widget`, `windows` and `backend` entry points. A path fails if it:

- is blank, longer than 500 characters, or contains a tab or line break;
- starts with `/` or `\`, a drive letter (`C:`) or a URL scheme (`file:`, `https:`…);
- has a `..` segment, with either separator.

`%2e`, `%2f` and `%5c` count as `.`, `/` and `\`, so `%2e%2e/x.html` fails too. A filename with
two dots, such as `my..page.html`, is fine. Omniscio refuses to load a plugin that breaks this rule.
:::

`entryPoint` and `sidebar` are **both optional** — a `ui` block is useful for its side effects
alone, e.g. `{ "hideProjectPanel": true }`. (Earlier SDK versions required them, so a manifest Omniscio
installed happily could fail `amc-plugin validate`.)

::: warning "Full width" is two flags, not one
The column Omniscio clears for you has **two** owners, and each has its own opt-out. Hiding one
alone just hands the column to the other, so a plugin that wants the full width must set both:

```json
{ "ui": { "hideProjectPanel": true, "hideSessionsPane": true } }
```

`hideSessionsPane` was missing from this SDK's schema until 2026-08-21. Because the schema is
non-strict, a manifest declaring both **kept `hideProjectPanel` and silently dropped its
sibling** on the way through `amc-plugin validate` and `package` — so the plugin looked
correct dev-loaded and un-full-widthed itself once packaged. If you worked around that by
giving up on full width, you can stop.
:::

`contextTemplate` supports single-pass `{{placeholder}}` substitution. Available variables are
`date`, `projectName`, `sessionName`, `workDir` and `pluginName`. A whitespace-only template is
treated as absent rather than rejected.

`entryPoint` and `sidebar` are both **optional**, matching Omniscio. A `ui` block carrying only
`hideProjectPanel` or `sessions` is valid -- those are useful without a webview. Omit the whole
block if you need none of them.

`contextTemplate` is folded *after* Omniscio's built-in plugin context, so your text adds to the
system context rather than replacing it.

## `keybindings` Array

Registers keyboard shortcuts your plugin owns (`src/shared/plugin-manifest-schema.ts:360-373`).

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

At most **20** entries; a longer list fails validation.

## `process` Block

Declares the bare command names your backend may spawn (`src/shared/plugin-manifest-schema.ts:374-393`).

```json
{
  "process": {
    "allowedCommands": ["ffmpeg", "ffprobe"]
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `allowedCommands` | string[] | Yes | 1–20 bare command names — letters, digits, `.`, `_`, `+`, `-` only; no path separators, wildcards, whitespace or shell characters |

General-purpose interpreters and shells (`node`, `python`, `bash`, `powershell`, `cmd`) and
command launchers (`git`, `ssh`, `make`, `env`, `xargs`) are refused by name: allowing one would
let the plugin run arbitrary code, so the host rejects the manifest rather than trusting the plugin.
The full list is `INTERPRETER_DENYLIST` in `src/shared/plugin-manifest-schema.ts:44-103`.

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

Omit the entire `backend` block if your plugin is UI-only.

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

Requires the `cli` permission.

## `sdkVersion`

The Omniscio plugin-SDK **contract** your plugin needs — not the version of the `@agent-mc/plugin-sdk` package. Omniscio checks it against the contract it provides, and a plugin it cannot satisfy is marked incompatible and loses its toolbar button.

```json
{
  "sdkVersion": "2.0.0"
}
```

Write a bare version. A bare version means "this contract or newer", so your plugin keeps loading as Omniscio moves forward. A caret range means "this major only": it breaks on the next contract major, and `"^3.0.0"` — what CLI 3.0.0 scaffolded — is refused outright by Omniscio's `2.0.0` contract. The scaffolder writes `"2.0.0"`, the contract Omniscio has provided since v0.1.103, and leaves the SDK dependency in `package.json` as an ordinary npm range.

## `sessionTools`

Gives the AI sessions your plugin starts (`ctx.sessions.create` or `AgentMC.session.create`) the
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
- It must be `true` or `false`; anything else fails `amc-plugin validate`.

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
