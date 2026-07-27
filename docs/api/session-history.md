# Session History

Read the user's **past** AMC sessions and projects.

**Availability:** Backend only (`ctx.sessionHistory`)
**Required Permission:** `sessions.readHistory`

::: warning Default-deny, and it stays that way
Declaring the permission grants nothing. Your plugin sees an empty list until the user picks specific projects or sessions in the grant picker raised by `requestAccess()`. `getMessages()` **throws** for a session that was never granted, and every read is written to an audit log the plugin cannot touch.

This is deliberately not the same shape as the other permissions: consent at install time is not consent to read a particular conversation.
:::

Distinct from the [Sessions](./sessions) API, which spawns and drives *new* sessions. This one only ever reads history, and never writes.

## Methods

### `listProjects(): Promise<HistoryProject[]>`

Projects the user has granted. Empty until a grant exists.

### `listSessions(): Promise<HistorySession[]>`

Sessions the user has granted, directly or via a granted project. Empty until a grant exists.

### `getMessages(options: { sessionId: string }): Promise<HistoryMessage[]>`

The text-only turns of one granted session.

**Rejects** when the session was not granted. That is a rejection rather than an empty array on purpose -- an empty array reads as "this conversation had no messages", which is a different and misleading fact.

### `requestAccess(options?: { kinds?: ('session' | 'project')[] }): Promise<HistoryGrantResult>`

Open the user's grant picker. Resolves once they choose or cancel.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `options.kinds` | `('session' \| 'project')[]` | Limit the picker to sessions or to projects. Defaults to both |

## Types

```typescript
interface HistoryProject {
  id: string
  name: string
}

interface HistorySession {
  id: string
  name: string
  projectId: string
  status: string
  lastActiveAt: string
}

interface HistoryMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface HistoryGrantResult {
  requestId: string
  cancelled?: boolean
  sessionIds?: string[]
  projectIds?: string[]
}
```

| `HistoryMessage` field | Type | Description |
|---|---|---|
| `id` | `string` | Message identifier |
| `role` | `'user' \| 'assistant'` | Who spoke |
| `content` | `string` | Plain conversation text. Tool calls, tool output and file contents are **stripped by the host** |
| `timestamp` | `string` | ISO timestamp |

## Example

```typescript
export function activate(ctx: PluginContext) {
  ctx.cli.handle('/summarize-history', async () => {
    let sessions = await ctx.sessionHistory.listSessions()

    if (sessions.length === 0) {
      const grant = await ctx.sessionHistory.requestAccess({ kinds: ['session'] })
      if (grant.cancelled) {
        // The user declining is a normal outcome, not a failure.
        return { status: 200, body: { summary: null, reason: 'No sessions shared' } }
      }
      sessions = await ctx.sessionHistory.listSessions()
    }

    const first = sessions[0]
    if (!first) return { status: 200, body: { summary: null, reason: 'Nothing granted' } }

    const messages = await ctx.sessionHistory.getMessages({ sessionId: first.id })
    const transcript = messages.map((m) => `${m.role}: ${m.content}`).join('\n')

    return { status: 200, body: { summary: await ctx.ai.generateTitle(transcript) } }
  })
}
```

## Notes

- `content` is conversation text only. Do not build a feature that depends on reading tool output or file contents from history -- the host removes them before your plugin sees them.
- A grant is the user's to give and to withdraw. Re-check `listSessions()` rather than caching ids across runs; a previously readable session can start throwing.
- Call `requestAccess()` in response to something the user did. A picker that appears on activation, before they have asked for anything, is the fastest way to have your plugin uninstalled.

## Testing

`createTestContext()` defaults to nothing granted, matching the host. Seed `sessionHistory` to exercise the granted paths.

```typescript
const h = createTestContext({
  sessionHistory: {
    sessions: [
      { id: 's1', name: 'Refactor', projectId: 'p1', status: 'done', lastActiveAt: '2026-01-01' }
    ],
    messages: {
      s1: [{ id: 'm1', role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:00Z' }]
    },
    grantResult: { sessionIds: ['s1'] }
  }
})

await h.ctx.sessionHistory.getMessages({ sessionId: 's1' }) // resolves
await h.ctx.sessionHistory.getMessages({ sessionId: 's2' }) // rejects -- never granted
```

Only ids present in `messages` are readable, so the harness reproduces the default-deny behaviour rather than merely returning empty arrays.
