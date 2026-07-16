# Recording Demo

Preview of the forthcoming **recording** API — starting, stopping, listing, and sharing screen
recordings from a plugin.

> ⚠️ **Not yet wired.** The `recording` permission is recognized by AMC's install-time consent
> dialog and the `PluginRecording` type ships in the SDK, but the host bridge is **not** connected
> yet — these calls are currently **inert** (they resolve to nothing or reject). This example is a
> forward-looking template so your plugin is ready the moment the bridge lands. Do not rely on it in
> production.

## What It Will Show

- `AgentMC.recording.start({ source })` — begin a screen / window / tab recording
- `AgentMC.recording.stop(handle)` — stop and finalize a recording
- `AgentMC.recording.list()` — list this plugin's recordings
- `AgentMC.recording.getShareUrl(recordingId)` — get a shareable URL
- `AgentMC.recording.delete(recordingId)` — remove a recording

## Type Shapes

```typescript
interface RecordingHandle { recordingId: string }

interface Recording {
  id: string
  filename: string
  durationMs: number
  createdAt: string   // ISO 8601
  sizeBytes: number
}
```

## Permissions

| Permission | Why |
|---|---|
| `recording` | Start / stop / manage screen recordings |

## Running

```bash
cd examples/recording-demo
npm install
npm run build
npm run dev
```

Because the bridge is inert, the buttons will report that recording is not yet available — that is
expected today.
