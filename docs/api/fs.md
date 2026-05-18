# Filesystem

Read and write files within the plugin's sandboxed data directory. All paths are relative to this directory -- plugins cannot access files outside their sandbox.

**Availability:** Backend only (`ctx.fs`)
**Required Permission:** `storage`

## Methods

### `readFile(relativePath: string): Promise<string>`

Read the contents of a file as a UTF-8 string.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `relativePath` | `string` | Path relative to the plugin's data directory |

**Returns:** `Promise<string>` -- the file contents.

**Example:**

```typescript
const config = await ctx.fs.readFile('config.json')
const parsed = JSON.parse(config)
```

---

### `writeFile(relativePath: string, content: string): Promise<void>`

Write a string to a file. Creates the file if it does not exist, overwrites it if it does. Parent directories are created automatically.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `relativePath` | `string` | Path relative to the plugin's data directory |
| `content` | `string` | The content to write |

**Returns:** `Promise<void>`

**Example:**

```typescript
const report = generateReport(data)
await ctx.fs.writeFile('output/report.md', report)

// Nested directories are created automatically
await ctx.fs.writeFile('exports/2026/05/data.csv', csvContent)
```

---

### `exists(relativePath: string): Promise<boolean>`

Check whether a file exists.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `relativePath` | `string` | Path relative to the plugin's data directory |

**Returns:** `Promise<boolean>` -- `true` if the file exists, `false` otherwise.

**Example:**

```typescript
const hasConfig = await ctx.fs.exists('config.json')
if (!hasConfig) {
  await ctx.fs.writeFile('config.json', JSON.stringify(defaults))
}
```

---

### `listDir(relativePath?: string): Promise<string[]>`

List files in a directory. If no path is provided, lists the root of the plugin's data directory.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `relativePath` | `string` (optional) | Directory path relative to the plugin's data directory |

**Returns:** `Promise<string[]>` -- an array of filenames in the directory.

**Example:**

```typescript
// List root directory
const rootFiles = await ctx.fs.listDir()

// List a subdirectory
const reports = await ctx.fs.listDir('output')
for (const file of reports) {
  ctx.log.info(`Found report: ${file}`)
}
```

---

### `deleteFile(relativePath: string): Promise<void>`

Delete a file.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `relativePath` | `string` | Path relative to the plugin's data directory |

**Returns:** `Promise<void>`

**Example:**

```typescript
await ctx.fs.deleteFile('output/old-report.md')
```

## Notes

- All paths are relative to the plugin's data directory. Attempting to use absolute paths or `..` to escape the sandbox will be rejected.
- Files are read and written as UTF-8 strings. Binary file support is not available.
- The `storage` permission covers the Filesystem API, [Storage](./storage), and [Database](./db) APIs together. Declaring `storage` once in your manifest grants access to all three.
- For bundled read-only assets (templates, default configs), use the frontend [Assets](./index#assets) bridge API instead.
