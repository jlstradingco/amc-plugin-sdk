# Sessions

Create and manage Claude Code sessions programmatically.

::: warning The two surfaces answer differently
`ctx.sessions` (backend) and `AgentMC.session` (frontend) share method names but **do not share
return shapes**. `getStatus` resolves a bare string on the backend and an object on the frontend;
message bodies are named `text` on the backend and `content` on the frontend. Check which surface
you are on before reading a result — this page states the shape for each.
:::

**Availability:** Both (backend `ctx.sessions` / frontend `AgentMC.session`)
**Required Permission:** `sessions`

## Backend Methods

The backend `PluginSessions` interface is available as `ctx.sessions`.

### `create(opts: { prompt?: string; userInitiated?: boolean }): Promise<{ sessionId: string }>`

Create a new Claude Code session on your plugin's own virtual project.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `opts.prompt` | `string` (optional) | Initial prompt to send to the session |
| `opts.userInitiated` | `boolean` (optional) | Mark the session as user-provoked rather than plugin-background. This is what decides whether Omniscio surfaces it in the sidebar or hides it as plugin chatter |

**Returns:** `Promise<{ sessionId: string }>` -- the ID of the newly created session.

::: tip The session has no built-in tools by default
It can only answer in text unless your manifest declares [`sessionTools: true`](../guide/manifest#sessiontools).
:::

::: warning There is no `projectId` option
Earlier SDK versions declared one. Omniscio has **always** derived the project from your plugin ID
(`__plugin_<id>__`) and has never read a caller-supplied project, so code passing `projectId`
appeared to target a project and silently did not. It has been removed rather than left to mislead.
:::

`userInitiated` is read on this backend surface only — the frontend's `AgentMC.session.create`
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

### `sendMessage(sessionId: string, text: string): Promise<void>`

Send a follow-up message to an existing session.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `sessionId` | `string` | The session ID |
| `text` | `string` | The message text to send |

**Returns:** `Promise<void>`

**Example:**

```typescript
await ctx.sessions.sendMessage(sessionId, 'Focus on SQL injection vulnerabilities')
```

---

### `getStatus(sessionId: string): Promise<SessionStatus>`

Get the current status of a session.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `sessionId` | `string` | The session ID |

**Returns:** `Promise<SessionStatus>` -- a **bare string**, e.g. `'running'`, `'needs_you'`, `'ended'`.

The frontend's `AgentMC.session.getStatus` resolves `{ status, pendingAction }` instead. Same
method name, two shapes.

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

### `onStatusChange(sessionId: string, handler: (status: string) => void): () => void`

Subscribe to status changes for a session.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `sessionId` | `string` | The session ID to monitor |
| `handler` | `(status: string) => void` | Callback invoked when the status changes |

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

## Frontend Methods

The frontend `BridgeSession` interface is available as `AgentMC.session`.

::: info Differences from backend
- `create()` accepts **only** `prompt` — `userInitiated` is silently discarded on this surface.
- `getStatus()` resolves an **object**, where the backend resolves a bare string.
- `getMessages()` names the message body **`content`**, where the backend names it `text`, and it
  drops still-streaming rows the backend keeps.
- `sendMessage()` takes an options object instead of a plain string.
- `create()` accepts only `prompt` -- the bridge's schema strips `userInitiated`, so passing it
  here has no effect. (Neither surface accepts `projectId`.)
- `getStatus()` resolves to `{ status, pendingAction }` here, but to a bare `string` on the
  backend. Check which surface you are on before destructuring.
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
const { sessionId } = await AgentMC.session.create({
  prompt: 'Review the latest changes',
})
```

### `sendMessage(sessionId: string, opts: { text: string }): Promise<void>`

Note the options-object signature instead of a plain string.

```typescript
await AgentMC.session.sendMessage(sessionId, { text: 'Check for memory leaks' })
```

### `getMessages(sessionId: string): Promise<BridgeSessionMessage[]>`

Rows of `{ id, role, content, timestamp }` — the body is **`content`** on this surface, not `text`.
Still-streaming rows are dropped; `system` rows are kept and the body is raw (tool calls and tool
output are not stripped).

```typescript
const messages = await AgentMC.session.getMessages(sessionId)
messages.forEach((m) => console.log(`${m.role}: ${m.content}`))
```

For a cleaned, user/assistant-only transcript use [`ctx.sessionHistory.getMessages()`](./session-history.md)
on the backend instead.

### `getStatus(sessionId: string): Promise<{ status, pendingAction }>`

Resolves an **object**, not a bare string. `pendingAction` is `null` unless the session is waiting
on something.

```typescript
const { status, pendingAction } = await AgentMC.session.getStatus(sessionId)
if (status === 'needs_you') console.log(`Waiting on: ${pendingAction}`)
```

::: danger Comparing the result to a string never matches
`const s = await AgentMC.session.getStatus(id); if (s === 'ended')` is always false — `s` is an
object. Read `s.status`. Older SDK versions typed this as `Promise<string>`, so this mistake used
to compile; it is now a type error.
:::

### `rename(sessionId: string, name: string): Promise<void>`

Rename a session. Frontend only.

```typescript
await AgentMC.session.rename(sessionId, 'Security Audit - Round 2')
```

### `stop(sessionId: string): Promise<void>`

```typescript
await AgentMC.session.stop(sessionId)
```

### `launchWithDraft(opts: { projectId: string; draftText: string; autoSend?: boolean }): Promise<void>`

Open a new session in Omniscio's main UI with pre-filled draft text. Frontend only.

Unlike `create()`, this one **does** take a real `projectId` — it launches into one of the user's
own projects rather than your plugin's virtual one. `autoSend` submits the draft immediately
instead of leaving it in the composer.

```typescript
await AgentMC.session.launchWithDraft({
  projectId: 'proj-abc-123',
  draftText: 'Refactor the auth module to use OAuth 2.0',
  autoSend: false,
})
```

## Per-context chats (`AgentMC.sessionsPane`)

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
await AgentMC.sessionsPane.setContext({ key: doc.id, label: doc.fileName })
await AgentMC.sessionsPane.setContext(null)
```

## Notes

- Creating a session spawns a real Claude Code process. Each session consumes API credits.
- `ctx.sessions.create()` always targets your plugin's own virtual project; use
  `AgentMC.session.launchWithDraft()` when you need to launch into one of the user's projects.
- Status values are `'running'`, `'needs_you'`, `'error'`, `'stalled'`, `'starting'`, `'ready'`,
  `'terminating'`, `'ended'`, `'archived'`, `'paused'` and `'waiting'`. (`'needs_input'` appeared in
  earlier versions of this page and is not a status Omniscio reports.) The `SessionStatus` type keeps
  these as autocomplete suggestions while still accepting a status a future Omniscio release adds.
- Concurrent `AgentMC.session.create()` calls with an identical prompt are de-duplicated and resolve
  to the same `sessionId`.
