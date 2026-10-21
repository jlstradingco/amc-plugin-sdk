# Core

Read-only access to the user's sessions, projects and the text of their messages.

**Availability:** Backend only (`ctx.core`)
**Required Permission:** `coreRead` (elevated)

`ctx.core` is typed as optional (`core?: PluginCore`), like `ctx.rpc` and `ctx.host`. Check for it and fail with a clear message rather than assuming it, as the example below does.

::: warning This reads everything the user has
`coreRead` is a **blanket** read across all of the user's sessions and projects, not a per-session grant. Omniscio lists it as an elevated permission and describes it to the user as "Read your sessions, projects, and the text of their messages (never their secrets)". Ask for it only when you are genuinely building something that needs the whole picture, and say why in your plugin description.

If you only need one session's history, use [Session History](./session-history) instead: it is opt-in per session.
:::

Deleted sessions and sessions the app keeps hidden (such as silent recipe runs) are never returned. Omniscio records each read in an audit table.

## Methods

### `core.sessions.list(filter?): Promise<CoreSession[]>`

All visible sessions. Pass `{ projectId }` to restrict the list to one project.

### `core.sessions.get(sessionId): Promise<CoreSession | null>`

One session. `null` when the id is unknown, deleted or hidden.

### `core.projects.list(): Promise<CoreProject[]>`

All projects that have not been deleted.

### `core.projects.get(projectId): Promise<CoreProject | null>`

One project, or `null` when the id is unknown or deleted.

### `core.messages.list(sessionId, window?): Promise<CoreMessage[]>`

A session's messages as text. **Capped at 200.** `window` can lower the cap but never raise it: a value that is not a positive number below 200 gives 200. Returns `[]` for an unknown, deleted or hidden session, which is not an error.

## Types

```typescript
interface CoreSession {
  id: string
  projectId: string
  name: string
  status: string          // a plain string; do not rely on a fixed set of values
  lastActiveAt: string    // ISO 8601
}

interface CoreProject {
  id: string
  name: string
  folderPath: string      // absolute path on the user's machine
}

interface CoreMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string       // ISO 8601
}
```

## Example

```typescript
import type { PluginActivate } from '@agent-mc/plugin-sdk'

const activate: PluginActivate = (ctx) => ({
  async onEnable() {
    const core = ctx.core
    if (!core) {
      throw new Error('This plugin needs ctx.core: declare `coreRead` and run it on an Omniscio that provides it.')
    }
    const projects = await core.projects.list()
    for (const project of projects) {
      const sessions = await core.sessions.list({ projectId: project.id })
      ctx.log.info(`${project.name}: ${sessions.length} sessions`)
    }
  },
})

export default activate
```

## Notes

- There is no webview equivalent. Reach this data from your backend and pass what the page needs over [`ctx.events`](./events).
- Messages come back as text, up to 200 per call.
- Treat message text as the user's private content. Do not send it off the machine unless the user has plainly agreed.

## Testing

`createTestContext()` starts with nothing, like a brand-new install. Seed what your plugin needs:

```typescript
const h = createTestContext({
  core: {
    projects: [{ id: 'p1', name: 'Web app', folderPath: '/work/web' }],
    sessions: [
      { id: 's1', projectId: 'p1', name: 'Fix login', status: 'idle', lastActiveAt: '2026-01-01T00:00:00.000Z' },
    ],
    messages: {
      s1: [{ id: 'm1', role: 'user', content: 'Fix the redirect', timestamp: '2026-01-01T00:00:00.000Z' }],
    },
  },
})

await h.ctx.core?.sessions.list({ projectId: 'p1' })  // [ s1 ]
await h.ctx.core?.messages.list('s1', 1)              // at most one message
await h.ctx.core?.sessions.get('nope')                // null, as on the host
```

The mock applies the host's 200-message cap and the `window` rule. The dev shell serves a small fixed set of sample sessions, projects and messages, so you can see your UI against something.
