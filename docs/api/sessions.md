# Sessions

Create and manage Claude Code sessions programmatically.

::: warning The two surfaces answer differently
`ctx.sessions` (backend) and `Omniscio.session` (frontend) share method names but **do not share
return shapes**. `getStatus` resolves a bare string on the backend and an object on the frontend;
message bodies are named `text` on the backend and `content` on the frontend. Check which surface
you are on before reading a result — this page states the shape for each.
:::

**Availability:** Both (backend `ctx.sessions` / frontend `Omniscio.session`)
**Required Permission:** `sessions`

## Backend Methods

The backend `PluginSessions` interface is available as `ctx.sessions`.

### `create(opts: PluginSessionCreateOptions): Promise<PluginSessionCreateResult>`

Create a new Claude Code session on your plugin's own virtual project.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `opts.prompt` | `string` (optional) | Initial prompt to send to the session |
| `opts.userInitiated` | `boolean` (optional) | Mark the session as user-provoked rather than plugin-background. This is what decides whether Omniscio surfaces it in the sidebar or hides it as plugin chatter |
| `opts.clientRequestId` | `string` (optional) | 1 to 128 characters. A create that repeats it within 10 minutes returns the first session's id instead of starting another |
| `opts.provider` | `string` (optional) | Which AI engine runs the session, such as `'claude'`. Leave it out to use the user's own default |
| `opts.model` | `string` (optional) | A tier word (`'genius'`, `'smart'`, `'worker'`, `'basic'`), which always means that tier's current model, or a model name the engine offers. A model that does not belong to the engine is refused |
| `opts.locked` | `boolean` (optional) | `true` locks the session to Omniscio's own tool lock for your plugin. Anything other than a real boolean is refused, never read as unlocked |
| `opts.access` | `'text' \| 'web'` (optional) | What the session may reach. `'text'` (the default) answers in text only; `'web'` also allows web search and public pages, and needs the `network` permission |
| `opts.startedBy` | `'me' \| 'agent'` (optional) | `'agent'` marks a session an AI agent asked for, rather than the person |

**Returns:** `Promise<{ sessionId: string; locked?: true; startedBy?: 'agent' }>` -- the ID of the
newly created session. `locked: true` is present when you created it with `locked: true`, and
`startedBy: 'agent'` when you passed `startedBy: 'agent'`.

::: tip The session has no built-in tools by default
It can only answer in text unless your manifest declares [`sessionTools: true`](../guide/manifest#sessiontools).
:::

::: warning There is no `projectId` option
Earlier SDK versions declared one. Omniscio has **always** derived the project from your plugin ID
(`__plugin_<id>__`) and has never read a caller-supplied project, so code passing `projectId`
appeared to target a project and silently did not. It has been removed rather than left to mislead.
:::

`userInitiated` is read on this backend surface only — the frontend's `Omniscio.session.create`
silently discards it.

**Example:**

```typescript
const { sessionId } = await ctx.sessions.create({
  prompt: 'Analyze the codebase for security issues',
  userInitiated: true,
})
ctx.log.info(`Created session: ${sessionId}`)
```

---

### `sendMessage(sessionId: string, text: string, options?: { images?: PluginSessionImage[] }): Promise<void>`

Send a follow-up message to an existing session.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `sessionId` | `string` | The session ID |
| `text` | `string` | The message text to send (still required when you send pictures) |
| `options.images` | `PluginSessionImage[]` | Optional. Pictures for the AI to look at, each `{ data, mimeType }` with `data` as bare base64 (no `data:` prefix) and `mimeType` one of `image/png`, `image/jpeg`, `image/webp` or `image/gif`. Needs the [`sessions.images`](../guide/permissions#sessions-images) permission and a session with no tools. |

**Returns:** `Promise<void>`

The picture limits (count, size, pixels, the per-session total) and the refusal codes a rejected
send starts with are listed under [`sessions.images`](../guide/permissions#sessions-images).

**Example:**

```typescript
await ctx.sessions.sendMessage(sessionId, 'Focus on SQL injection vulnerabilities')

// With a picture (needs sessions.images)
await ctx.sessions.sendMessage(sessionId, 'Critique this thumbnail', {
  images: [{ data: pngBase64, mimeType: 'image/png' }]
})
```

---

### `getStatus(sessionId: string): Promise<SessionStatus>`

Get the current status of a session.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `sessionId` | `string` | The session ID |

**Returns:** `Promise<SessionStatus>` -- a **bare string**, e.g. `'running'`, `'needs_you'`, `'ended'`.

The frontend's `Omniscio.session.getStatus` resolves `{ status, pendingAction }` instead. Same
method name, two shapes.

### `getStatus(sessionId: string, opts: { detail: true }): Promise<SessionStatusDetail>`

Pass `{ detail: true }` to get an object instead: `{ status, pendingAction, recoveryTerminal }`.

`recoveryTerminal` is `true` once Omniscio's auto-recovery has given up on the session for good. A
session that shows `needs_you` or `error` while recovery is still retrying reads `false`. Free any
work you were holding for the session only when it is `true`.

Any other option, or none, keeps the bare string. An older Omniscio ignores the option and resolves
the bare string, so check `typeof result === 'string'` if you support older hosts.

```typescript
const s = await ctx.sessions.getStatus(sessionId, { detail: true })
if (typeof s !== 'string' && s.recoveryTerminal) releaseItem(sessionId)
```

**Example:**

```typescript
const status = await ctx.sessions.getStatus(sessionId)
ctx.log.info(`Session status: ${status}`)
```

---

### `getMessages(sessionId: string): Promise<SessionMessage[]>`

Retrieve the conversation history for a session.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `sessionId` | `string` | The session ID |

**Returns:** `Promise<SessionMessage[]>` -- rows of `{ id, role, text, timestamp }`.

Note the body field is **`text`** here. Of the three message reads this is the only genuinely
unfiltered one: still-streaming (partial) rows are **not** removed and `system` rows are included,
so a poll can observe a half-written assistant turn.

**Example:**

```typescript
const messages = await ctx.sessions.getMessages(sessionId)
const lastReply = messages.filter((m) => m.role === 'assistant').at(-1)
ctx.log.info(`Latest reply: ${lastReply?.text ?? '(none yet)'}`)
```

---

### `stop(sessionId: string): Promise<void>`

Stop a running session.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `sessionId` | `string` | The session ID |

**Returns:** `Promise<void>`

**Example:**

```typescript
await ctx.sessions.stop(sessionId)
```

---

### `archive(sessionId: string): Promise<void>`

Backend only — the frontend `Omniscio.session` has no `archive`.

File away a session your plugin created, so it leaves the user's board. A running session is ended
first. Archiving is reversible from the Archive view and does not delete the session's messages.

Only a session your plugin owns can be archived: one in your plugin's own sandbox, or one you
launched into a real project. Any other id is refused (`does not belong to plugin`), and an id that
does not exist is refused with `Session not found`.

The host can also refuse with its own sentence when the session cannot be archived yet — for
example while it is shared, while it holds unshipped work, or while it is waiting on a final card
the user has not read. Catch the error and retry later rather than treating it as a bug.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `sessionId` | `string` | The session ID |

**Returns:** `Promise<void>`

**Example:**

```typescript
try {
  await ctx.sessions.archive(sessionId)
} catch (err) {
  ctx.log.warn(`Could not archive ${sessionId}: ${String(err)}`)
}
```

---

### `onStatusChange(sessionId: string, handler: (status: string, info: SessionStatusInfo) => void): () => void`

Subscribe to status changes for a session.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `sessionId` | `string` | The session ID to monitor |
| `handler` | `(status: string, info: SessionStatusInfo) => void` | Callback invoked when the status changes. `info` is `{ pendingAction, recoveryTerminal }`; an older Omniscio passes the status only |

**Returns:** `() => void` -- call this function to unsubscribe.

**Example:**

```typescript
const unsubscribe = ctx.sessions.onStatusChange(sessionId, (status) => {
  ctx.log.info(`Session ${sessionId} changed to: ${status}`)
  if (status === 'ended') {
    unsubscribe()
  }
})
```

The handler also fires, with the status unchanged, at the moment auto-recovery gives up on a session,
so `info.recoveryTerminal` turning `true` reaches you without polling:

```typescript
ctx.sessions.onStatusChange(sessionId, (_status, info) => {
  if (info?.recoveryTerminal) releaseItem(sessionId)
})
```

---

### `fanout(opts): Promise<{ launched, queued, skipped, swarmBoard? }>`

Start several sessions in one call — one per project — from a shared prompt. This is the batch road;
`create` makes one session.

**Required Permission:** `sessions.launchAny` — and **not** `sessions`, which this call does not
need. Built-in and first-party only: a third-party plugin is refused even when it declares the
permission. Every session it starts is paid, so call it only when the person has asked for the batch.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `opts.prompt` | `string` | The prompt every target receives, up to 200,000 characters |
| `opts.targets` | `array` | 1 to 20 targets, each `{ projectId, provider?, model?, thinkingLevel?, mcpOverrides?, location? }` — `location` is `'local'` or `'cloud'` |
| `opts.name` | `string` | Optional label for the session names, up to 100 characters |
| `opts.peerAwareness` | `boolean` | Prefix each prompt with a briefing naming the other sessions |
| `opts.swarm` | `boolean` | Turns on peer awareness and creates one shared board for the batch |

**Returns:** `Promise<{ launched, skipped, queued, swarmBoard? }>`

| Field | Meaning |
|---|---|
| `launched` | The sessions that started now: `{ sessionId, projectId, provider, model }` |
| `queued` | Targets the spawn pacer accepted and DEFERRED: `{ projectId, position, etaSeconds }`. They start later, so they are in neither of the other two lists |
| `skipped` | Targets that will not start, each with `reason` — and, when the engine/model pair was the cause, `kind: 'foreign' \| 'retired'` |
| `swarmBoard?` | The shared board's channel, present only when you passed `swarm: true` |

**Example:**

```typescript
const { launched, queued, skipped } = await ctx.sessions.fanout({
  prompt: 'Review this migration plan and list the risks.',
  targets: [{ projectId: planProjectId, location: 'cloud' }],
  name: 'Migration review',
})
ctx.log.info(`${launched.length} started, ${queued.length} waiting, ${skipped.length} skipped`)
```

---

### `reveal(sessionId: string): Promise<void>`

Bring a plugin session the person has never seen into the main session list and open it, instead of
leaving it among the plugin's hidden background sessions.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `sessionId` | `string` | Your plugin's own session id |

**Returns:** `Promise<void>`.

It works on a session your plugin created, and only while that session is still owned by you; a
session the person already sees is unaffected (it is opened, not duplicated). A session created with
`userInitiated: true` is visible already and needs no reveal.

**Example:**

```typescript
const { sessionId } = await ctx.sessions.create({ prompt: 'Draft the launch notes' })
await ctx.sessions.reveal(sessionId)
```

## Frontend Methods

The frontend `BridgeSession` interface is available as `Omniscio.session`.

::: info Differences from backend
- `create()` accepts **only** `prompt` — `userInitiated` is silently discarded on this surface.
- `getStatus()` resolves an **object**, where the backend resolves a bare string.
- `getMessages()` names the message body **`content`**, where the backend names it `text`, and it
  drops still-streaming rows the backend keeps.
- `sendMessage()` takes an options object instead of a plain string.
- `create()` accepts only `prompt` -- the bridge's schema strips `userInitiated`, so passing it
  here has no effect. (Neither surface accepts `projectId`.)
- `getStatus()` resolves to `{ status, pendingAction, recoveryTerminal }` here, but to a bare
  `string` on the backend unless you pass `{ detail: true }`. Check which surface you are on before
  destructuring. `recoveryTerminal` is absent on an older Omniscio.
- `getMessages()` puts the message body on `content` here; the backend puts it on `text`. This
  split is deliberate on the host's side, so do not write `m.text ?? m.content ?? ''` -- pick
  the surface you are on.
- `rename()` is available only on the frontend.
- `launchWithDraft()` is available only on the frontend.
- `onStatusChange()` is not available on the frontend.
:::

### `create(opts: { prompt?: string }): Promise<{ sessionId: string }>`

Like the backend `create()`, the session has no built-in tools unless your manifest declares
[`sessionTools: true`](../guide/manifest#sessiontools).

```typescript
const { sessionId } = await Omniscio.session.create({
  prompt: 'Review the latest changes',
})
```

### `sendMessage(sessionId: string, opts: { text: string; images?: PluginSessionImage[] }): Promise<void>`

Note the options-object signature instead of a plain string. `images` follows the same rules as
the backend (see [`sessions.images`](../guide/permissions#sessions-images)).

```typescript
await Omniscio.session.sendMessage(sessionId, { text: 'Check for memory leaks' })
```

### `getMessages(sessionId: string): Promise<BridgeSessionMessage[]>`

Rows of `{ id, role, content, timestamp }` — the body is **`content`** on this surface, not `text`.
Still-streaming rows are dropped; `system` rows are kept and the body is raw (tool calls and tool
output are not stripped).

```typescript
const messages = await Omniscio.session.getMessages(sessionId)
messages.forEach((m) => console.log(`${m.role}: ${m.content}`))
```

For a cleaned, user/assistant-only transcript use [`ctx.sessionHistory.getMessages()`](./session-history.md)
on the backend instead.

### `getStatus(sessionId: string): Promise<{ status, pendingAction }>`

Resolves an **object**, not a bare string. `pendingAction` is `null` unless the session is waiting
on something.

```typescript
const { status, pendingAction } = await Omniscio.session.getStatus(sessionId)
if (status === 'needs_you') console.log(`Waiting on: ${pendingAction}`)
```

::: danger Comparing the result to a string never matches
`const s = await Omniscio.session.getStatus(id); if (s === 'ended')` is always false — `s` is an
object. Read `s.status`. Older SDK versions typed this as `Promise<string>`, so this mistake used
to compile; it is now a type error.
:::

### `rename(sessionId: string, name: string): Promise<void>`

Rename a session. Frontend only.

```typescript
await Omniscio.session.rename(sessionId, 'Security Audit - Round 2')
```

### `stop(sessionId: string): Promise<void>`

```typescript
await Omniscio.session.stop(sessionId)
```

### `delete(sessionId: string): Promise<void>`

Permanently erase a background session your plugin created in its own sandbox: Omniscio stops it,
then removes the session and every message, search entry and attachment it stored, at once. Use it
when your user deletes the thing the session worked on, so their text does not linger. The same call
is `ctx.sessions.delete(sessionId)` on the backend.

It rejects, and removes nothing, for a session a person can see (`userInitiated`, or revealed), one
launched into a real project, another plugin's session, or one that cannot be stopped. Panels on a
paired phone cannot call it.

```typescript
await Omniscio.session.delete(sessionId)
```

### `launchWithDraft(opts: { projectId: string; draftText: string; autoSend?: boolean }): Promise<void>`

Open a new session in Omniscio's main UI with pre-filled draft text. Frontend only.

Unlike `create()`, this one **does** take a real `projectId` — it launches into one of the user's
own projects rather than your plugin's virtual one. `autoSend` submits the draft immediately
instead of leaving it in the composer.

```typescript
await Omniscio.session.launchWithDraft({
  projectId: 'proj-abc-123',
  draftText: 'Refactor the auth module to use OAuth 2.0',
  autoSend: false,
})
```

## Per-context chats (`Omniscio.sessionsPane`)

A plugin whose Sessions pane should show one set of chats per open item (a document, a board, a
file) opts in with two manifest keys and one webview call.

```json
{
  "ui": {
    "sessions": {
      "perContext": true,
      "noContextText": "Open a document to start a Chat.",
      "contextTemplate": "Work only on document {{contextKey}} ({{contextLabel}})."
    }
  }
}
```

### Chat beside your plugin (`ui.sessions.chatPlacement`)

`"chatPlacement": "beside"` keeps your page loaded and on screen while one of its chats is open: your
page keeps the left of the panel and the chat takes a strip on the right (360-560 px). The default,
`"replace"`, shows the chat over your page as before. Desktop only.

### Locking down pane chats (`ui.sessions.lockDown`)

Set `"lockDown": true` under `ui.sessions` to give every chat the person starts from your pane the
plugin safety floor: a room of its own, none of the person's setup, a short tool list, and a prompt
for every command and web request.

**The chat's folder is its own room**, not your plugin's installed folder:
`<user data folder>/../amc-plugin-rooms/<user data folder name>/<your id>/<chat id>/`. The chat's
file tools can read and write freely there, and reach the projects the person granted your plugin —
and nothing else. It cannot touch the app's data folder at all, so it cannot read or write your
plugin's installed files (`<user data folder>/plugins/<your id>/`), `manifest.json` included: your
manifest and code are trusted and run outside the floor, so nothing running under the floor may
rewrite them. Two things are easier than for other floored sessions: one plain `curl` to your own
actions at `http://127.0.0.1:<port>/plugins/<your id>/cli/<path>` runs without a prompt (keep it to
one command, headers, one inline JSON body with no `$` variables), and file tools reach only that
room and the projects the person granted your plugin. Actions you did not mark `safe` still ask the
person through the inbox.

### `sessionsPane.setContext(context: { key: string; label: string } | null): Promise<void>`

Tell Omniscio what is open right now. Webview only; needs no permission. Call it whenever the open
item changes, and with `null` when nothing is open.

- `key` is your stable id for the item: 1-128 characters from `A-Z a-z 0-9 . _ -`. Use an id that
  survives a restart, so the item's chats come back when it is reopened.
- `label` is what the person sees above the list ("Chats for report.pdf"): 1-200 characters, no
  line breaks or other control characters.

With `perContext` on, the pane lists only the chats started for the active key, and its suggested
prompts, "New session" button and header "+" start chats for that key. With no active key the pane
shows `noContextText` (or a short host sentence) and offers no way to start a chat. A launch for a
key your plugin has not declared since the app started is refused.

`{{contextKey}}` and `{{contextLabel}}` in `contextTemplate` are filled from the chat's own item;
both are empty for a chat that belongs to no item. Without `perContext` nothing changes.

```typescript
await Omniscio.sessionsPane.setContext({ key: doc.id, label: doc.fileName })
await Omniscio.sessionsPane.setContext(null)
```

## Notes

- Creating a session spawns a real Claude Code process. Each session consumes API credits.
- `ctx.sessions.create()` always targets your plugin's own virtual project; use
  `Omniscio.session.launchWithDraft()` when you need to launch into one of the user's projects.
- Status values are `'running'`, `'needs_you'`, `'error'`, `'stalled'`, `'starting'`, `'ready'`,
  `'terminating'`, `'ended'`, `'archived'`, `'paused'` and `'waiting'`. (`'needs_input'` appeared in
  earlier versions of this page and is not a status Omniscio reports.) The `SessionStatus` type keeps
  these as autocomplete suggestions while still accepting a status a future Omniscio release adds.
- Concurrent `Omniscio.session.create()` calls with an identical prompt are de-duplicated and resolve
  to the same `sessionId`.
