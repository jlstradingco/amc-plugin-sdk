# Settings

Read your plugin's settings as configured by the user through AMC's Settings > Plugins panel.

**Availability:** Both (backend `ctx.settings` / frontend `AgentMC.settings`)
**Required Permission:** None

## Methods

### `getAll(): Promise<Record<string, unknown>>`

Retrieve all settings for your plugin as a key-value object.

**Returns:** `Promise<Record<string, unknown>>` -- an object containing all setting keys and their current values.

**Example:**

```typescript
// Frontend
const settings = await AgentMC.settings.getAll()
const apiUrl = settings.apiUrl as string
const maxRetries = settings.maxRetries as number

// Backend
const settings = await ctx.settings.getAll()
ctx.log.info(`API URL: ${settings.apiUrl}`)
```

---

### `get(key: string): Promise<unknown>`

Retrieve a single setting by its key.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `key` | `string` | The setting key to look up |

**Returns:** `Promise<unknown>` -- the setting value, or `undefined` if not set.

**Example:**

```typescript
// Frontend
const apiKey = await AgentMC.settings.get('apiKey') as string
if (!apiKey) {
  AgentMC.toast.show({
    type: 'error',
    message: 'Please configure your API key in Settings > Plugins',
  })
}

// Backend
const interval = await ctx.settings.get('syncInterval') as number ?? 30
ctx.log.info(`Sync interval: ${interval} minutes`)
```

## Defining Settings

Settings are declared in `manifest.json` using the `settings` array. Each entry defines a key, type, label, and optional default value:

```json
{
  "settings": [
    {
      "key": "apiUrl",
      "type": "string",
      "label": "API URL",
      "description": "The base URL for the API",
      "default": "https://api.example.com"
    },
    {
      "key": "maxRetries",
      "type": "number",
      "label": "Max Retries",
      "description": "Number of retry attempts on failure",
      "default": 3
    },
    {
      "key": "enableSync",
      "type": "boolean",
      "label": "Enable Auto-Sync",
      "default": true
    },
    {
      "key": "apiKey",
      "type": "string",
      "label": "API Key",
      "description": "Your API key (stored securely)"
    }
  ]
}
```

AMC renders these as a settings form in the Settings > Plugins panel. Users configure the values there, and your plugin reads them at runtime.

See [Manifest > Settings](../guide/manifest#settings) for the full settings schema.

## Notes

- Settings are read-only from the plugin's perspective. Plugins cannot write settings programmatically -- only the user can change them through AMC's UI.
- No permission is required. Every plugin can read its own settings.
- Use `getAll()` when you need multiple settings at once to avoid multiple round-trips. Use `get(key)` when you only need a single value.
- Settings values may be `undefined` if the user has not configured them and no default is set in the manifest. Always handle the `undefined` case.
- Setting keys are scoped to your plugin. Two different plugins can use the same key name without conflict.
