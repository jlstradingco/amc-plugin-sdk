# Database

Collection-based CRUD storage backed by SQLite. Supports filtering, ordering, and pagination.

**Availability:** Both (backend `ctx.db` / frontend `AgentMC.db`)
**Required Permission:** `storage`

## QueryOptions

Several methods accept an optional `QueryOptions` object:

```typescript
interface QueryOptions {
  where?: Record<string, unknown>           // Field equality filters
  orderBy?: Record<string, 'asc' | 'desc'>  // Column -> sort direction
  limit?: number                            // Maximum rows to return
  offset?: number                           // Number of rows to skip
}
```

## Methods

### `insert(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>>`

Insert a new row into a collection. An `id` field is generated automatically if not provided.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `collection` | `string` | The collection name (must be declared in `manifest.json`) |
| `data` | `Record<string, unknown>` | The fields to insert |

**Returns:** `Promise<Record<string, unknown>>` -- the inserted row, including the generated `id`.

**Example:**

```typescript
// Frontend
const task = await AgentMC.db.insert('tasks', {
  title: 'Review PR #42',
  priority: 1,
  done: false,
})
console.log(task.id) // 'a1b2c3...'

// Backend
const task = await ctx.db.insert('tasks', {
  title: 'Review PR #42',
  priority: 1,
  done: false,
})
```

---

### `query(collection: string, options?: QueryOptions): Promise<Record<string, unknown>[]>`

Query rows from a collection with optional filters, ordering, and pagination.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `collection` | `string` | The collection name |
| `options` | `QueryOptions` (optional) | Filter, sort, and pagination options |

**Returns:** `Promise<Record<string, unknown>[]>` -- an array of matching rows.

**Example:**

```typescript
// Frontend -- get all tasks
const allTasks = await AgentMC.db.query('tasks')

// Frontend -- filtered and sorted
const urgent = await AgentMC.db.query('tasks', {
  where: { priority: 1, done: false },
  orderBy: { created_at: 'desc' },
  limit: 10,
})

// Backend -- paginated
const page2 = await ctx.db.query('tasks', {
  orderBy: { created_at: 'asc' },
  limit: 20,
  offset: 20,
})
```

---

### `getById(collection: string, id: string): Promise<Record<string, unknown> | null>`

Retrieve a single row by its ID.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `collection` | `string` | The collection name |
| `id` | `string` | The row ID |

**Returns:** `Promise<Record<string, unknown> | null>` -- the row, or `null` if not found.

**Example:**

```typescript
// Frontend
const task = await AgentMC.db.getById('tasks', 'a1b2c3')

// Backend
const task = await ctx.db.getById('tasks', 'a1b2c3')
if (!task) {
  ctx.log.warn('Task not found')
}
```

---

### `update(collection: string, id: string, fields: Record<string, unknown>): Promise<void>`

Update specific fields on an existing row. Fields not included in the update are left unchanged.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `collection` | `string` | The collection name |
| `id` | `string` | The row ID to update |
| `fields` | `Record<string, unknown>` | The fields to update |

**Returns:** `Promise<void>` -- re-read the row with `getById()` if you need the updated values.

**Example:**

```typescript
// Frontend
await AgentMC.db.update('tasks', 'a1b2c3', {
  done: true,
  completedAt: Date.now(),
})

// Backend
await ctx.db.update('tasks', 'a1b2c3', {
  done: true,
  completedAt: Date.now(),
})
```

---

### `delete(collection: string, id: string): Promise<void>`

Delete a single row by its ID.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `collection` | `string` | The collection name |
| `id` | `string` | The row ID to delete |

**Returns:** `Promise<void>`

**Example:**

```typescript
// Frontend
await AgentMC.db.delete('tasks', 'a1b2c3')

// Backend
await ctx.db.delete('tasks', 'a1b2c3')
```

---

### `deleteWhere(collection: string, where: Record<string, unknown>): Promise<void>`

Delete all rows matching a set of field equality conditions.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `collection` | `string` | The collection name |
| `where` | `Record<string, unknown>` | Field equality filters |

**Returns:** `Promise<void>`

**Example:**

```typescript
// Frontend -- delete all completed tasks
await AgentMC.db.deleteWhere('tasks', { done: true })

// Backend -- delete all low-priority items
await ctx.db.deleteWhere('tasks', { priority: 0 })
```

### `upsert(collection: string, conflictColumns: string[], data: Record<string, unknown>): Promise<Record<string, unknown>>`

Insert a row, or update the existing one when it collides with a UNIQUE column tuple your collection declares. Atomic — a single `INSERT … ON CONFLICT DO UPDATE`.

Use this instead of "query, then insert-or-update". That pattern looks safe in a single process but is a real race: two AMC instances sharing one plugin database can both read "absent" and both insert, leaving duplicate rows a UNIQUE index then rejects on the next write.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `collection` | `string` | The collection name |
| `conflictColumns` | `string[]` | The UNIQUE tuple to match on — must be one of the collection's declared `uniqueIndexes` |
| `data` | `Record<string, unknown>` | The full row to insert, or the fields to update on conflict |

**Returns:** `Promise<Record<string, unknown>>` — the persisted row.

**Example:**

```typescript
// One row per (projectId, day) no matter how many times this runs
await ctx.db.upsert('daily_totals', ['projectId', 'day'], {
  projectId: 'proj-1',
  day: '2026-08-13',
  total: 42
})
```

The tuple must be declared first — see `uniqueIndexes` in [Manifest](../guide/manifest).

### `count(collection: string): Promise<number>`

The number of rows in one collection.

Cheap: an index-only scan. Prefer it over `query(collection).length`, which loads and JSON-deserializes every row just to produce a number.

**Returns:** `Promise<number>`

```typescript
if ((await ctx.db.count('events')) > 10_000) await trimOldEvents()
```

### `stats(): Promise<PluginStorageStats>`

Your plugin's storage footprint — per-collection row counts and allocated bytes, plus your rows in the shared key-value and secrets tables. Takes no arguments: it is always scoped to your own plugin.

**Returns:**

| Field | Type | Description |
|---|---|---|
| `method` | `'dbstat' \| 'payload-estimate'` | How the byte figures were produced — **branch on this** |
| `totalRows` | `number` | Rows across every collection |
| `totalBytes` | `number` | Allocated bytes across every collection |
| `collections` | `{ name, rows, bytes }[]` | Per-collection breakdown |
| `kvBytes` | `number` | Payload bytes of your rows in the shared key-value table |
| `secretsBytes` | `number` | Payload bytes of your rows in the shared secrets table |

**On accuracy, because a retention policy depends on it.** `method: 'dbstat'` is page-accurate — it counts indexes and partially-filled pages, landing within roughly +10%/−0% of true allocated storage. `method: 'payload-estimate'` is a degraded fallback that sums row payloads only: it misses **every index**, reads roughly 33% low, and its error scales with your collection's *schema* rather than its data, so a threshold tuned against it fires late by an unpredictable margin.

Two caveats that surprise people: `kvBytes`/`secretsBytes` are always payload-only (those tables are shared across plugins, so per-plugin page attribution is impossible), and after a large delete your figure drops before the database file shrinks, because freed pages return to SQLite's freelist until a VACUUM. That is the right behaviour for a retention policy — it measures what you own, not what the file happens to be.

```typescript
const s = await ctx.db.stats()
if (s.method === 'dbstat' && s.totalBytes > 50 * 1024 * 1024) await trimOldEvents()
```

## Notes

- Collections must be declared in the `db.collections` array in `manifest.json` before they can be used. See [Manifest](../guide/manifest).
- **Uninstalling your plugin deletes everything here.** Collections, key-value entries and secrets are removed together when the user uninstalls; reinstalling brings your code back but not the data. Disabling a plugin keeps everything.
- The `where` filter uses strict equality matching. There is no support for comparison operators (`>`, `<`, `LIKE`, etc.) -- use `query()` without `where` and filter in application code if you need complex conditions.
- Row IDs are UUID strings generated by AMC. You can provide your own `id` in the `data` object passed to `insert()`, but it must be unique within the collection.
- All values must be JSON-serializable.
