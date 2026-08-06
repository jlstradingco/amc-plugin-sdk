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
| `opts.userInitiated` | `boolean` (optional) | Mark the session as user-provoked rather than plugin-background. This is what decides whether AMC surfaces it in the sidebar or hides it as plugin chatter |

**Returns:** `Promise<{ sessionId: string }>` -- the ID of the newly created session.

::: warning There is no `projectId` option
Earlier SDK versions declared one. AMC has **always** derived the project from your plugin ID
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
- `rename()` is available only on the frontend.
- `launchWithDraft()` is available only on the frontend.
- `onStatusChange()` is not available on the frontend.
:::

### `create(opts: { prompt?: string }): Promise<{ sessionId: string }>`

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

Open a new session in AMC's main UI with pre-filled draft text. Frontend only.

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

## Notes

- Creating a session spawns a real Claude Code process. Each session consumes API credits.
- `ctx.sessions.create()` always targets your plugin's own virtual project; use
  `AgentMC.session.launchWithDraft()` when you need to launch into one of the user's projects.
- Status values are `'running'`, `'needs_you'`, `'error'`, `'stalled'`, `'starting'`, `'ready'`,
  `'terminating'`, `'ended'`, `'archived'`, `'paused'` and `'waiting'`. (`'needs_input'` appeared in
  earlier versions of this page and is not a status AMC reports.) The `SessionStatus` type keeps
  these as autocomplete suggestions while still accepting a status a future AMC release adds.
- Concurrent `AgentMC.session.create()` calls with an identical prompt are de-duplicated and resolve
  to the same `sessionId`.
