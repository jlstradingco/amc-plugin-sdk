# Recording

Capture screen, window, or tab recordings through AMC, then list, share, or delete them. Useful for plugins that produce walkthroughs, bug repros, or demo clips.

**Availability:** Backend only (`ctx.recording`)
**Required Permission:** `recording`

## Methods

### `start(options?): Promise<RecordingHandle>`

Begin a recording. Returns a handle you pass to [`stop()`](#stop).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `options.source` | `'screen' \| 'window' \| 'tab'` (optional) | What to capture; defaults to the app's standard source |

**`RecordingHandle`:**

| Field | Type | Description |
|---|---|---|
| `recordingId` | `string` | Id of the in-progress recording |

```typescript
const handle = await ctx.recording.start({ source: 'window' })
```

---

### `stop(handle): Promise<{ recordingId: string }>`

Finish a recording started with [`start()`](#start). The finished recording is saved and appears in [`list()`](#list).

```typescript
const { recordingId } = await ctx.recording.stop(handle)
```

---

### `list(): Promise<Recording[]>`

List the plugin's recordings.

**`Recording`:**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Recording id |
| `filename` | `string` | Stored filename |
| `durationMs` | `number` | Length in milliseconds |
| `createdAt` | `string` | ISO timestamp of when it was created |
| `sizeBytes` | `number` | File size in bytes |

```typescript
const recordings = await ctx.recording.list()
```

---

### `getShareUrl(recordingId): Promise<string>`

Return a shareable URL for a finished recording.

```typescript
const url = await ctx.recording.getShareUrl(recordingId)
ctx.toast.show({ type: 'success', message: `Recording ready: ${url}` })
```

---

### `delete(recordingId): Promise<void>`

Delete a recording.

```typescript
await ctx.recording.delete(recordingId)
```

## Example — record a short clip and share it

```typescript
const handle = await ctx.recording.start({ source: 'screen' })

// ... user performs the flow you want to capture ...

const { recordingId } = await ctx.recording.stop(handle)
const url = await ctx.recording.getShareUrl(recordingId)

ctx.toast.notify({ title: 'Recording saved', body: url })
```

## Notes

- Always `stop()` a handle you `start()` — an abandoned recording keeps capturing.
- `list()` returns only the recordings your plugin created.
- Recordings can be large; check `sizeBytes` and clean up with `delete()` when you no longer need them.
