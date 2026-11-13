# Session Control

Ask the user which of their sessions and projects your plugin may manage, then message, pause, unpause, snooze, archive and unarchive those sessions from your plugin's backend.

**Availability:** The webview (`Omniscio.sessionControl`) opens the picker: `requestAccess()`. The backend (`ctx.sessionControl`) lists the sessions your plugin may manage (`list`) and changes them (`message`, `pause`, `unpause`, `snooze`, `archive`, `unarchive`).
**Required Permission:** `sessions.control` for everything on this page.

::: tip Default-deny
Declaring `sessions.control` grants nothing by itself. Your plugin manages no session until the user picks it, or picks its project, in the picker that `requestAccess()` opens. A session that is not picked, and a session that does not exist, answer the same way, so a plugin cannot probe for sessions it was not given.
:::

::: tip Available when the person turns it on
The whole Session Control API is available when the person has turned on **Plugin control of your sessions** in Labs. Until then, `list()` and `requestAccess()` reject with "This feature is not available." and a change resolves `{ ok: false, code: 'FEATURE_OFF' }`.
:::

## Permission

`sessions.control` is an elevated permission. Omniscio describes it to the user as "Manage your sessions: Send a message to, pause, unpause, snooze, archive and unarchive the sessions and projects you choose. It never sees what they say. It asks you first before messaging, pausing, archiving or reopening one, unless you turn that off in Settings."

```json
{
  "permissions": ["sessions.control"]
}
```

It is a separate permission from [`sessions`](./sessions), which lets a plugin start and run its own sessions. `sessions.control` reaches the user's other sessions, including ones your plugin did not start.

The user can review each grant, and every change your plugin made, in the same review panel as other plugin grants. They can revoke a grant there. Disabling or uninstalling the plugin revokes them.

## Which sessions a plugin gets

The picker lets the user choose individual sessions, whole projects, or both. A picked project covers its sessions, including the ones the user starts in it later.

Some sessions are never handed to a plugin, even inside a picked project. `list()` leaves them out and a change to one resolves `NOT_FOUND`:

- private AI Coaching and Journal sessions
- hidden sessions and review sessions
- another plugin's sessions

A session running on another computer can show up in `list()`, but every change to it resolves `CONFLICT`. Your plugin can only change sessions on the computer it runs on.

Your plugin never sees what a session says. `list()` returns names, projects, status and when a session was last active, and nothing a session or the user wrote.

## Webview methods

### `requestAccess(): Promise<PluginSessionControlAccessOutcome>`

Open Omniscio's session and project picker so the user can choose what your plugin may manage. Resolves when the picker closes, with every picked session and project.

**Returns:** `Promise<PluginSessionControlAccessOutcome>`. When the user closes the picker without choosing, `cancelled` is `true`; `sessions` and `projects` still hold anything picked earlier.

## Backend methods

Each backend method is on `ctx.sessionControl`. Reads are limited to 60 a minute per plugin, and changes to 10 a minute per plugin. A read that fails for an unexpected reason rejects with "Something went wrong. Try again."

### `list(): Promise<PluginControlledSession[]>`

The sessions your plugin may manage right now: every picked session, and every session in a picked project, up to 200. Sessions that are off-limits are left out.

**Returns:** `Promise<PluginControlledSession[]>`. The array is empty until the user has picked something.

---

### `message(sessionId: string, text: string): Promise<PluginWriteResult<{ id: string }>>`

Send a message to a session, as if another agent had sent it. The session sees it as coming from your plugin by name. `text` is 1 to 4,000 characters and cannot be only spaces.

A session that is archived, or that the user closed themselves, resolves `CONFLICT`. Sending a message never wakes an archived session.

**Asks the user first** with the whole message shown, unless they turned that ask off.

---

### `pause(sessionId: string): Promise<PluginWriteResult<{ id: string }>>`

Pause a session. Any work it is doing right now stops.

**Asks the user first**, unless they turned that ask off.

---

### `unpause(sessionId: string): Promise<PluginWriteResult<{ id: string }>>`

Unpause a paused session. A session that is not paused resolves `CONFLICT`.

**Asks the user first**, unless they turned that ask off. A session the user closed themselves **always** asks.

---

### `snooze(sessionId: string, untilIso: string): Promise<PluginWriteResult<{ id: string }>>`

Snooze a session until `untilIso`, an ISO 8601 date-time in the future and no more than 30 days away. A time outside that range resolves `INVALID`. A paused session, or one already snoozed to the same or a later time, resolves `CONFLICT`.

**Never asks.**

---

### `archive(sessionId: string): Promise<PluginWriteResult<{ id: string }>>`

Archive a session. A session that is already archived resolves `CONFLICT`.

A session holding an answer the user has not read yet is **never** archived by a plugin, with or without the ask. That resolves `CONFLICT`.

**Asks the user first**, unless they turned that ask off.

---

### `unarchive(sessionId: string): Promise<PluginWriteResult<{ id: string }>>`

Bring back an archived session. A session that is not archived resolves `CONFLICT`.

**Asks the user first**, unless they turned that ask off. A session the user closed themselves **always** asks.

## Asking first

Messaging, pausing, archiving, unpausing and unarchiving each ask the user before they happen. The question is written by Omniscio from the session's own name (and, for a message, the full message text), so your plugin cannot word it. The change happens only after the user allows it, and Omniscio checks the grant again after the answer. Only one question per plugin can be open at a time. Snoozing never asks.

The user can turn each ask off on its own in **Settings → Plugins**:

| Toggle | Covers |
|---|---|
| Ask before a plugin messages a session | `message` |
| Ask before a plugin pauses a session | `pause` |
| Ask before a plugin archives a session | `archive` |
| Ask before a plugin unpauses a session | `unpause` |
| Ask before a plugin brings back a session | `unarchive` |

All five are on by default. Turning one off removes only the question: the pick, the off-limits sessions, the log and the limits still apply. Unpausing or unarchiving a session the user closed themselves asks even when its toggle is off.

## Results and refusals

A change never throws because it was refused. It resolves `{ ok: false, code }`, so check `ok` before you use `value`. On success, `value.id` is the session's id.

| `code` | What it means |
|---|---|
| `FEATURE_OFF` | The user has not turned on Plugin control of your sessions |
| `NOT_FOUND` | The session does not exist, is not picked for your plugin, or is one a plugin may never manage. These all look the same on purpose |
| `FORBIDDEN` | The user themselves may not make this change |
| `INVALID` | The change does not fit: a message of the wrong length, or a snooze time that is not in the future or is more than 30 days away |
| `CONFLICT` | The session is not in a state that allows the change (already paused, not paused, already archived, not archived, closed by the user, holding an unread answer, or running on another computer), or the change could not be completed right now. Call `list()` again before you retry |
| `RATE_LIMITED` | More than 10 changes in a minute |
| `DECLINED` | The user said no when asked |
| `BUSY` | The user is already looking at another question from your plugin. Wait for it to be answered, then ask again |
| `FAILED` | Something unexpected went wrong inside Omniscio. Nothing is promised about whether the change happened; call `list()` again before you retry |

## Types

```typescript
interface PluginSessionControlAccessOutcome {
  /** `true` when the person dismissed the picker without choosing. */
  cancelled: boolean
  /** Every session this plugin may now manage by itself, including ones picked earlier. */
  sessions: { id: string; name: string }[]
  /** Every project this plugin may now manage, including ones picked earlier. */
  projects: { id: string; name: string }[]
}

interface PluginControlledSession {
  id: string
  name: string
  projectId: string
  /** `null` when the project's name could not be read. */
  projectName: string | null
  status: string
  /** An ISO 8601 date-time. */
  lastActiveAt: string
}

type PluginWriteCode =
  | 'FEATURE_OFF' | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID'
  | 'CONFLICT' | 'RATE_LIMITED' | 'DECLINED' | 'BUSY' | 'FAILED'

type PluginWriteResult<T> = { ok: true; value: T } | { ok: false; code: PluginWriteCode }
```

## Example

In the webview, ask the user what your plugin may manage:

```typescript
const omniscio = window.Omniscio ?? window.AgentMC

async function pickSessions(): Promise<void> {
  const outcome = await omniscio.sessionControl.requestAccess()
  if (outcome.cancelled && outcome.sessions.length === 0 && outcome.projects.length === 0) {
    omniscio.toast.show({ type: 'info', message: 'No sessions picked yet.' })
  }
}
```

In the backend, snooze the sessions that have been idle for a day:

```typescript
import type { PluginContext } from '@omniscio/plugin-sdk'

const DAY_MS = 24 * 60 * 60 * 1000

export async function snoozeIdle(ctx: PluginContext): Promise<void> {
  const control = ctx.sessionControl!
  const until = new Date(Date.now() + DAY_MS).toISOString()
  for (const session of await control.list()) {
    if (Date.now() - Date.parse(session.lastActiveAt) < DAY_MS) continue
    const result = await control.snooze(session.id, until)
    if (!result.ok && result.code === 'RATE_LIMITED') break
    if (!result.ok) ctx.log.warn(`Could not snooze ${session.name}: ${result.code}`)
  }
}
```

## Notes

- `ctx.sessionControl` is optional on `PluginContext`, so a context double written before the SDK typed it still compiles. Use `ctx.sessionControl!` or check for it first.
- `@omniscio/plugin-sdk/browser` exports `BridgeSessionControl` and `PluginSessionControlAccessOutcome`. The backend types (`PluginSessionControl` and `PluginControlledSession`) are exported from `@omniscio/plugin-sdk`.
- To start and run your plugin's own sessions, see [Sessions](./sessions). To only watch when sessions start, finish or need the user, see [`sessions.observeStatus`](../guide/permissions#sessionsobservestatus).
