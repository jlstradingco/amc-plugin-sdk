# Recording

Start and stop screen recordings, mediated entirely by the host.

**Availability:** Backend only (`ctx.recording`)
**Required Permission:** `recording` (Tier-1 **elevated**)

::: danger `getShareUrl()` and `delete()` do not exist
Earlier versions of this SDK documented both. Neither has ever existed host-side, and their
absence is deliberate rather than unfinished: the host redacts the share token and the file
paths from everything a plugin can see, and it never lets a plugin delete a user's recording.
Calling either is a `TypeError`.

The same revision typed `stop()` to take the `{ recordingId }` object returned by `start()`.
The host wants a **bare string**, and passing an object resolves `{ ok: false }` silently
rather than throwing -- so the documented start-then-stop flow could never have worked.
:::

## What the plugin does not control

The plugin never chooses a capture source, never receives frames, file descriptors or media
files, and cannot share or delete a recording. Every `start` requires a fresh native confirm
the plugin cannot bypass, and `list()` / `get()` only ever return recordings **this plugin**
started.

## Methods

### `start(): Promise<RecordingStartResult>`

Takes **no arguments.** The host owns source selection and discards anything passed.

A refusal is **not** a rejection -- the recorder being off, already busy, rate-limited, or the
user dismissing the confirm all resolve with `{ ok: false, error }`. So `await` succeeding tells
you nothing; branch on `ok` before touching `recordingId`.

```typescript
type RecordingStartResult =
  | { ok: true; recordingId: string }
  | { ok: false; error: string }
```

### `stop(recordingId: string): Promise<RecordingStopResult>`

Takes a **bare id string**. Only works for a recording this plugin started *and* that is still
the active one. Also resolves rather than rejecting.

```typescript
interface RecordingStopResult { ok: boolean; error?: string }
```

### `list(): Promise<Recording[]>`

Recordings this plugin started. `[]` when there are none.

### `get(recordingId: string): Promise<Recording | null>`

`null` -- never a throw -- for an unknown or non-owned id.

## The `Recording` row

```typescript
interface Recording {
  id: string
  status: string
  durationMs: number
  sourceType: string
  sourceLabel: string
  startedAt: string
  endedAt: string | null   // null while still recording
}
```

This is a **redacted** view. `filename`, `createdAt` and `sizeBytes` were previously documented
and do not exist: the first and last are withheld by design, and `startedAt` is what
`createdAt` meant.

## Example

```typescript
const started = await ctx.recording.start()
if (!started.ok) {
  ctx.log.warn(`could not start recording: ${started.error}`)
  return
}

// ... later
const stopped = await ctx.recording.stop(started.recordingId)
if (!stopped.ok) ctx.log.warn(`could not stop: ${stopped.error}`)

const mine = await ctx.recording.list()
ctx.log.info(`${mine.length} recording(s), latest ${mine.at(-1)?.durationMs}ms`)
```

## Notes

- The `recording` permission renders the **elevated** consent notice, because a screen
  recording is irreversible-if-raw. What makes it safe is the per-action confirm, not the
  install-time grant.
- Teardown deliberately does not delete recordings a plugin started.
