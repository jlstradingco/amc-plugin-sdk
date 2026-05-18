# Sessions

Create and manage Claude Code sessions programmatically. The backend and frontend APIs are similar but have some differences in method signatures.

**Availability:** Both (backend `ctx.sessions` / frontend `AgentMC.session`)
**Required Permission:** `sessions`

## Backend Methods

The backend `PluginSessions` interface is available as `ctx.sessions`.

### `create(opts: { prompt?: string; projectId?: string }): Promise<{ sessionId: string }>`

Create a new Claude Code session.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `opts.prompt` | `string` (optional) | Initial prompt to send to the session |
| `opts.projectId` | `string` (optional) | AMC project ID to associate the session with |

**Returns:** `Promise<{ sessionId: string }>` -- the ID of the newly created session.

**Example:**

```typescript
const { sessionId } = await ctx.sessions.create({
  prompt: 'Analyze the codebase for security issues',
  projectId: 'proj-abc-123',
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

### `getStatus(sessionId: string): Promise<string>`

Get the current status of a session.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `sessionId` | `string` | The session ID |

**Returns:** `Promise<string>` -- the session status (e.g. `'running'`, `'needs_input'`, `'ended'`).

**Example:**

```typescript
const status = await ctx.sessions.getStatus(sessionId)
ctx.log.info(`Session status: ${status}`)
```

---

### `getMessages(sessionId: string): Promise<unknown[]>`

Retrieve the conversation history for a session.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `sessionId` | `string` | The session ID |

**Returns:** `Promise<unknown[]>` -- an array of message objects.

**Example:**

```typescript
const messages = await ctx.sessions.getMessages(sessionId)
ctx.log.info(`Session has ${messages.length} messages`)
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
- `create()` does not accept a `projectId` option.
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

### `getMessages(sessionId: string): Promise<unknown[]>`

```typescript
const messages = await AgentMC.session.getMessages(sessionId)
```

### `getStatus(sessionId: string): Promise<string>`

```typescript
const status = await AgentMC.session.getStatus(sessionId)
```

### `rename(sessionId: string, name: string): Promise<void>`

Rename a session. Frontend only.

```typescript
await AgentMC.session.rename(sessionId, 'Security Audit - Round 2')
```

### `stop(sessionId: string): Promise<void>`

```typescript
await AgentMC.session.stop(sessionId)
```

### `launchWithDraft(opts: { projectId: string; draftText: string }): Promise<void>`

Open a new session in AMC's main UI with pre-filled draft text. Frontend only.

```typescript
await AgentMC.session.launchWithDraft({
  projectId: 'proj-abc-123',
  draftText: 'Refactor the auth module to use OAuth 2.0',
})
```

## Notes

- Creating a session spawns a real Claude Code process. Each session consumes API credits.
- The `projectId` parameter associates the session with an AMC project so it appears in the correct sidebar group.
- Status values include `'starting'`, `'running'`, `'needs_input'`, `'paused'`, `'ended'`, `'error'`, and `'archived'`.
