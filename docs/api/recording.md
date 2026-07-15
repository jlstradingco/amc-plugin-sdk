# Recording

Start and stop screen recordings and manage the resulting files.

**Availability:** Both (backend `ctx.recording` / frontend `AgentMC.recording`)
**Required Permission:** `recording`

::: warning Not yet wired
The `recording` permission is recognized by the install-time consent dialog, and the `PluginRecording` type is part of the SDK surface, but the host bridge that backs it is **not yet available**. Calls are currently inert. Declaring `recording` today lets a plugin install cleanly (no "unknown permission" error) and be ready for when the bridge ships -- but do not depend on it doing anything yet. This page documents the intended surface.
:::

## Methods

### `start(options?: { source?: 'screen' | 'window' | 'tab' }): Promise<RecordingHandle>`

Begin a screen recording. Returns a handle you pass to `stop()`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `options.source` | `'screen' \| 'window' \| 'tab'` | What to capture. Defaults to the host's default source |

### `stop(handle: RecordingHandle): Promise<{ recordingId: string }>`

Stop a recording started with `start()`. Returns the id of the saved recording.

### `list(): Promise<Recording[]>`

List the recordings available to the plugin.

### `getShareUrl(recordingId: string): Promise<string>`

Return a shareable URL for a recording.

### `delete(recordingId: string): Promise<void>`

Delete a recording.

## Types

```typescript
interface RecordingHandle {
  recordingId: string
}

interface Recording {
  id: string
  filename: string
  durationMs: number
  createdAt: string
  sizeBytes: number
}
```

| `Recording` field | Type | Description |
|---|---|---|
| `id` | `string` | Recording identifier |
| `filename` | `string` | Stored filename |
| `durationMs` | `number` | Length in milliseconds |
| `createdAt` | `string` | ISO timestamp of when it was recorded |
| `sizeBytes` | `number` | File size in bytes |

## Example

```typescript
// Backend (intended surface -- currently inert, see warning above)
const handle = await ctx.recording.start({ source: 'screen' })
// ... later ...
const { recordingId } = await ctx.recording.stop(handle)

const url = await ctx.recording.getShareUrl(recordingId)
ctx.log.info(`Recording available at ${url}`)
```

## Notes

- Until the host bridge ships, treat this API as forward-looking. Guard calls behind a feature check or `try/catch` so your plugin degrades gracefully.
- `getShareUrl()` returns a URL the user can open or share; the sharing mechanism is owned by the host.
