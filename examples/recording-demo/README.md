# Recording Demo

Start, stop and list screen recordings from a plugin — driven by a webview, executed by the
plugin's **backend**.

> **This example was rewritten on 2026-08-11.** It previously called
> `AgentMC.recording.*` directly from the webview and wrapped every call in a try/catch that
> reported "recording is not yet available in this build". That message was wrong and it hid
> the real cause: **there is no `AgentMC.recording`.** Recording is a backend capability
> (`ctx.recording`), and the SDK had mistakenly declared it on the webview bridge too, so every
> call was `undefined`.

## What It Shows

- **The real API**, on the backend:
  - `ctx.recording.start()` — takes **no arguments**; the host owns source selection and raises
    a native confirm the plugin cannot bypass. Resolves `{ ok: true, recordingId }` or
    `{ ok: false, error }` — a refusal **resolves**, it does not reject.
  - `ctx.recording.stop(recordingId)` — takes a **bare id string**, not a handle object.
  - `ctx.recording.list()` / `ctx.recording.get(id)` — this plugin's recordings only.
- **Crossing the two surfaces**, since the UI cannot call the capability itself: the webview and
  the backend talk over the shared event bus (`AgentMC.events` ↔ `ctx.events`), which fans an
  `emit` out to subscribers on both sides.

There is no `getShareUrl` and no `delete`. Both were documented by earlier versions of this SDK
and neither has ever existed: the host redacts share tokens and file paths from everything a
plugin can see, and it never lets a plugin delete a user's recording.

## Type Shapes

```typescript
type RecordingStartResult =
  | { ok: true; recordingId: string }
  | { ok: false; error: string }

interface RecordingStopResult { ok: boolean; error?: string }

// The REDACTED view a plugin gets — no file path, no share token, no transcript.
interface Recording {
  id: string
  status: string
  durationMs: number
  sourceType: string
  sourceLabel: string
  startedAt: string        // ISO 8601
  endedAt: string | null   // null while still recording
}
```

`filename`, `createdAt` and `sizeBytes` appeared in an earlier version of this file and do not
exist. The first and last are withheld by design; `startedAt` is what `createdAt` meant.

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
