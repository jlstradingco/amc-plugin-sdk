# Database

Collection-based CRUD storage backed by SQLite. Supports filtering, ordering, and pagination.

**Availability:** Both (backend `ctx.db` / frontend `Omniscio.db`)
**Required Permission:** `storage`

## QueryOptions

Several methods accept an optional `QueryOptions` object:

```typescript
interface QueryOptions {
  where?: Record<string, unknown>           // Field equality filters
  orderBy?: Record<string, 'asc' | 'desc'>  // Column -> sort direction
  limit?: number                            // Maximum rows to return
  offset?: number                           // Number of rows to skip
  fields?: string[]                         // Columns to return; id/created_at/updated_at always come back
}
```

**A query returns one page.** Without a `limit` you get at most the first **100** rows — in insertion
order unless you pass `orderBy` — and a `limit` above 10,000 is capped at 10,000. To read every row,
page with `offset` until a page comes back short. If your code changes rows so they stop matching
`where` (marking them done, say), re-read from the start instead: an offset would skip rows.
`createTestContext()` and the dev shell page the same way, so a test that reads only one page fails
there, not in front of a person.

**`fields` returns part of a row instead of the whole of it.** Every returned row still carries `id`,
`created_at` and `updated_at`; your list adds the rest. Use it for a summary that needs a few small
columns from a collection whose rows also hold large documents — those never leave the store. `where`
and `orderBy` may name a column that is not in `fields`, and an unknown column is refused rather than
ignored. An **older host ignores `fields` entirely** and returns every column, so code that sends it
works everywhere and is only slower there.

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
const task = await Omniscio.db.insert('tasks', {
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
| `options` | `QueryOptions` (optional) | Filter, sort, pagination and column options |

**Returns:** `Promise<Record<string, unknown>[]>` -- an array of matching rows.

**Example:**

```typescript
// Frontend -- get all tasks
const allTasks = await Omniscio.db.query('tasks')

// Frontend -- filtered and sorted
const urgent = await Omniscio.db.query('tasks', {
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
const task = await Omniscio.db.getById('tasks', 'a1b2c3')

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
await Omniscio.db.update('tasks', 'a1b2c3', {
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

### `updateIf(collection: string, id: string, expect: Record<string, string | number | null>, fields: Record<string, unknown>): Promise<{ updated: boolean; row: PluginDbRow | null }>`

Update one row only if it still holds the values you expect. The check and the write are one atomic step, so nothing can change the row between them. Use it when you read a row, decide, and then write: a plain `update()` in between would overwrite whatever another screen or worker wrote in the meantime.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `collection` | `string` | The collection name |
| `id` | `string` | The row ID to update |
| `expect` | `Record<string, string \| number \| null>` | 1 to 16 columns and the value each must still hold. `null` matches an empty column. Text up to 4096 characters. Booleans are not accepted: store and compare `0` / `1`. |
| `fields` | `Record<string, unknown>` | The fields to write, as in `update()` |

**Returns:** `Promise<{ updated: boolean; row: PluginDbRow | null }>`

- `updated: true` -- the write landed. `row` is the row after the write.
- `updated: false` -- nothing was written because the row no longer matches `expect`. `row` is the row as it is now, or `null` if it was deleted. This is a normal answer, not an error: re-read and decide what to do. Never retry the same call blindly.
- A call with an empty `expect`, an unknown column or a value of another type throws, and nothing is written.

**Timestamps:** `updated_at` has millisecond resolution, so two writes in the same millisecond can leave the same value. When that matters, keep a counter column that every writer increments and put it in `expect`.

**Older Omniscio versions:** a host without this method answers `Unknown method: db.updateIf`. Treat that as "cannot do this safely" and skip the work. Do not fall back to `update()`, which has no check.

**Example:**

```typescript
// Backend: stop a run only if it is still running and nobody touched it since we looked
const run = await ctx.db.getById('runs', runId)
if (run && run.status === 'running') {
  const result = await ctx.db.updateIf(
    'runs',
    runId,
    { status: 'running', updated_at: run.updated_at },
    { status: 'stopped' }
  )
  if (!result.updated) return
  await cleanUpAfterStop(runId)
}
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
await Omniscio.db.delete('tasks', 'a1b2c3')

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
await Omniscio.db.deleteWhere('tasks', { done: true })

// Backend -- delete all low-priority items
await ctx.db.deleteWhere('tasks', { priority: 0 })
```

### `upsert(collection: string, conflictColumns: string[], data: Record<string, unknown>): Promise<Record<string, unknown>>`

Insert a row, or update the existing one when it collides with a UNIQUE column tuple your collection declares. Atomic — a single `INSERT … ON CONFLICT DO UPDATE`.

Use this instead of "query, then insert-or-update". That pattern looks safe in a single process but is a real race: two Omniscio instances sharing one plugin database can both read "absent" and both insert, leaving duplicate rows a UNIQUE index then rejects on the next write.

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
- Row IDs are UUID strings generated by Omniscio. You can provide your own `id` in the `data` object passed to `insert()`, but it must be unique within the collection.
- All values must be JSON-serializable.
