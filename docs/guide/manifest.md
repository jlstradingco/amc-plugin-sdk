# Manifest Reference

The `manifest.json` file is the central configuration for your plugin. It declares everything AMC needs to load, display, sandbox, and manage your plugin.

## Top-Level Structure

```json
{
  "plugin": { ... },
  "settings": [ ... ],
  "storage": { "collections": { ... } },
  "migrations": [ ... ],
  "sdkVersion": "^1.0.0",
  "ui": { ... },
  "backend": { ... },
  "permissions": [ ... ],
  "cli": { "endpoints": [ ... ] },
  "cron": { "jobs": [ ... ] }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `plugin` | object | Yes | Plugin identity and metadata |
| `settings` | array | Yes | User-configurable settings (can be empty `[]`) |
| `storage` | object | Yes | Database collection schemas (can be `{ "collections": {} }`) |
| `migrations` | array | Yes | Schema migration operations (can be empty `[]`) |
| `sdkVersion` | string | Yes | Required SDK version (e.g. `"^1.0.0"`) |
| `ui` | object | No | UI entry point and sidebar config |
| `backend` | object | No | Backend entry point and resource limits |
| `permissions` | array | No | Requested API permissions |
| `cli` | object | No | CLI endpoint declarations |
| `cron` | object | No | Cron job declarations |

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
    "minAppVersion": "0.1.30"
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
| `icon` | string | Yes | Image filename (e.g. `"icon.png"`) or [Lucide](https://lucide.dev/icons) icon name as fallback |
| `category` | string | Yes | One of: `planning`, `development`, `testing`, `devops`, `productivity`, `other` |
| `license` | object | Yes | `{ "type": "free" }`, `{ "type": "paid" }`, or `{ "type": "trial" }` |
| `minAppVersion` | string | No | Minimum AMC version required to run this plugin |

::: warning
The `id` field is permanent. It is used as the storage namespace, database prefix, and marketplace identifier. Changing it after publishing creates a new, separate plugin.
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

When you upload your plugin to the Marketplace, AMC automatically extracts the icon from the package and hosts it. If no image file is found, AMC falls back to showing the first letter of the plugin name.

::: tip
You can still use a [Lucide](https://lucide.dev/icons) icon name (e.g. `"puzzle"`) as a lightweight fallback, but an image file gives your plugin a distinctive look in the Marketplace.
:::

## `settings` Array

Declare user-configurable settings that appear in AMC's Settings > Plugins > Your Plugin panel. Each setting maps to a key that your plugin reads via `ctx.settings.get(key)` (backend) or `amc.settings.get(key)` (frontend).

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
| `testAction` | object | No | Adds a test button next to the setting (see below) |

### Test Actions

A `testAction` adds a button next to the setting that calls a backend method, useful for "Test connection" buttons:

```json
{
  "key": "apiKey",
  "label": "API Key",
  "type": "password",
  "default": "",
  "testAction": {
    "namespace": "myPlugin",
    "method": "testConnection",
    "label": "Test Connection"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `namespace` | string | Backend namespace for the method call |
| `method` | string | Method name to invoke |
| `label` | string | Button label (e.g. "Test Connection") |

## `storage` Block

Declare database collections your plugin uses. Each collection has named columns with types. AMC creates SQLite tables for each collection, namespaced to your plugin.

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

::: tip
Every collection automatically gets an `id` column (TEXT, primary key), a `created_at` column, and an `updated_at` column. You do not need to declare these.
:::

## `migrations` Array

When you change a collection's schema in a new version, declare migration operations so existing installations update cleanly.

```json
{
  "migrations": [
    {
      "version": "1.1.0",
      "operations": [
        {
          "type": "add_column",
          "collection": "tasks",
          "column": "dueDate",
          "columnType": "text"
        },
        {
          "type": "add_index",
          "collection": "tasks",
          "index": "dueDate"
        }
      ]
    },
    {
      "version": "1.2.0",
      "operations": [
        {
          "type": "remove_column",
          "collection": "tasks",
          "column": "score"
        },
        {
          "type": "remove_index",
          "collection": "tasks",
          "index": "title"
        }
      ]
    }
  ]
}
```

### Migration Operations

| Operation | Required Fields | Description |
|---|---|---|
| `add_column` | `collection`, `column`, `columnType` | Add a new column to an existing collection |
| `remove_column` | `collection`, `column` | Remove a column from an existing collection |
| `add_index` | `collection`, `index` | Create an index on a column |
| `remove_index` | `collection`, `index` | Drop an index |

::: warning
Migrations run in order by `version` (semver). Each migration is applied once. Always increment your plugin version in `plugin.version` when adding migrations.
:::

## `ui` Block

Declares the frontend entry point and sidebar appearance.

```json
{
  "ui": {
    "entryPoint": "dist/ui/index.html",
    "sidebar": {
      "title": "My Plugin",
      "icon": "puzzle"
    }
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `entryPoint` | string | Yes | Path to the HTML file (relative to plugin root) |
| `sidebar.title` | string | Yes | Label shown in AMC's sidebar |
| `sidebar.icon` | string | Yes | [Lucide](https://lucide.dev/icons) icon name |

Omit the entire `ui` block if your plugin is backend-only.

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
| `entryPoint` | string | Yes | Path to the compiled JS file exporting `activate` |
| `resourceLimits.memoryMb` | number | No | Memory limit for the backend worker (in MB) |

Omit the entire `backend` block if your plugin is UI-only.

## `permissions` Array

List the permissions your plugin needs. AMC shows these to the user during installation.

```json
{
  "permissions": ["storage", "sessions", "ai", "network", "cron", "cli", "notifications", "rss"]
}
```

See [Permissions](./permissions) for a detailed breakdown of what each permission grants.

## `cli` Block

Declare CLI endpoints that external tools can call through AMC's control server.

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

## `cron` Block

Declare scheduled jobs that AMC runs on a cron schedule.

```json
{
  "cron": {
    "jobs": [
      {
        "id": "heartbeat",
        "label": "Heartbeat Check",
        "schedule": "*/30 * * * *",
        "description": "Periodic health check",
        "approvalRequired": true
      }
    ]
  }
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique job identifier |
| `label` | string | Human-readable label shown in the AMC UI |
| `schedule` | string | Cron expression (standard 5-field format) |
| `description` | string | Description of what the job does |
| `approvalRequired` | boolean | If `true`, the user must approve each run in the inbox |

Requires the `cron` permission.

## `sdkVersion`

Declares the SDK version your plugin was built against. AMC uses this for compatibility checks.

```json
{
  "sdkVersion": "^1.0.0"
}
```

Use semver range syntax. The scaffolder sets this to `"^1.0.0"` by default.

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
  "migrations": [],
  "sdkVersion": "^1.0.0",
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
  "migrations": [],
  "sdkVersion": "^1.0.0",
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
  "migrations": [],
  "sdkVersion": "^1.0.0",
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
  },
  "cron": {
    "jobs": [
      {
        "id": "heartbeat",
        "label": "Heartbeat Check",
        "schedule": "*/30 * * * *",
        "description": "Periodic health check",
        "approvalRequired": true
      }
    ]
  }
}
```
