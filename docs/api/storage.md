# Storage

Simple key-value storage for persisting plugin data across sessions and restarts.

**Availability:** Both (backend `ctx.storage` / frontend `AgentMC.storage`)
**Required Permission:** `storage`

## Methods

### `get(key: string): Promise<unknown>`

Retrieve a stored value by its key.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `key` | `string` | The key to look up |

**Returns:** `Promise<unknown>` -- the stored value, or `undefined` if the key does not exist.

**Example:**

```typescript
// Frontend
const lastRun = await AgentMC.storage.get('lastRun')

// Backend
const lastRun = await ctx.storage.get('lastRun')
```

---

### `set(key: string, value: unknown): Promise<void>`

Store a value under a key. Overwrites any existing value for that key.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `key` | `string` | The key to store under |
| `value` | `unknown` | The value to store (must be JSON-serializable) |

**Returns:** `Promise<void>`

**Example:**

```typescript
// Frontend
await AgentMC.storage.set('lastRun', Date.now())
await AgentMC.storage.set('config', { theme: 'dark', limit: 50 })

// Backend
await ctx.storage.set('lastRun', Date.now())
await ctx.storage.set('config', { theme: 'dark', limit: 50 })
```

---

### `delete(key: string): Promise<void>`

Remove a key and its value from storage.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `key` | `string` | The key to delete |

**Returns:** `Promise<void>`

**Example:**

```typescript
// Frontend
await AgentMC.storage.delete('lastRun')

// Backend
await ctx.storage.delete('lastRun')
```

---

### `list(prefix?: string): Promise<{ key: string; value: unknown }[]>`

List all stored key-value pairs, optionally filtered by a key prefix.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `prefix` | `string` (optional) | If provided, only keys starting with this prefix are returned |

**Returns:** `Promise<{ key: string; value: unknown }[]>` -- an array of key-value pairs.

**Example:**

```typescript
// Frontend -- list all entries
const all = await AgentMC.storage.list()

// Frontend -- list entries with a prefix
const configEntries = await AgentMC.storage.list('config:')

// Backend
const all = await ctx.storage.list()
const configEntries = await ctx.storage.list('config:')
```

## Notes

- Values must be JSON-serializable (strings, numbers, booleans, arrays, plain objects). Functions, `Date` objects, and class instances will not round-trip correctly.
- Keys are scoped to your plugin. Two different plugins can use the same key name without conflict.
- For structured data with querying needs, use the [Database](./db) API instead.
