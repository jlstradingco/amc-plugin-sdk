# Panel Commands

Your plugin's backend should only ever act on a command that arrives through a door an AI agent
cannot open: your own panel, or your own code. A row in one of your tables is not such a door.
Every agent session on the person's computer can read your tables, and on Omniscio versions without
the plugin-table fence it can write them too. A backend that runs whatever `pending` rows it finds
lets any agent act as the person.

`@agent-mc/plugin-sdk/commands` (SDK 3.2.0 and later) is the safe way to send commands from your
panel to your backend, and it is meant to be the easy way too.

## What the channel promises

1. **Commands arrive only through your panel or your own code.** The channel never reads a table
   row as a command, so a forged, edited or re-armed row does nothing.
2. **Input is checked before it is accepted.** Bad input queues nothing.
3. **At most once.** An accepted command runs at most once; changes run one at a time, in arrival
   order; the result (or the failure) is handed to the panel exactly once, and the panel never
   re-sends on its own.
4. **Honest outcomes.** When the panel cannot know whether a command ran, it says so
   (`outcome-unknown`) — never "failed", never "nothing ran".
5. **Old Omniscio versions fail safe.** Before v0.1.92 the panel gets an "update Omniscio" error
   and writes nothing. It never falls back to rows.
6. **No leaks, and no storage.** Inputs and results are never logged and never written to tables
   or to storage. The channel never reads or writes `ctx.storage` at all: an AI agent on the
   person's computer can read and change a plugin's storage, so the channel keeps nothing there to
   trust. Commands live only in memory, so a restart drops the ones still waiting.
7. **Bounded.** The queue, parallel reads, input size and uncollected results all have limits.
8. **One check, one answer.** The [ship check](#the-ship-check) reads only your manifest, so
   `validate`, `preflight` and `publish` agree.

Each promise is locked by a test in the SDK.

## Quick start

**Backend** — declare each command once: `parse` checks the input (throw to refuse it), `run` does
the work. Return the input you validated from `parse`; the panel's input type comes from it.

```typescript
// src/backend/commands.ts
import { defineCommand } from '@agent-mc/plugin-sdk/commands'

export const commands = {
  sendDraft: defineCommand({
    parse(input) {
      const { draftId } = (input ?? {}) as { draftId?: unknown }
      if (typeof draftId !== 'string') throw new Error('draftId is required')
      return { draftId }
    },
    async run({ draftId }) {
      // ... send it ...
      return { sentAt: new Date().toISOString() }
    },
  }),
  listDrafts: defineCommand({
    mode: 'read',
    parse: () => null,
    run: async () => [{ id: 'd1', subject: 'Hello' }],
  }),
}
```

```typescript
// src/backend/index.ts
import type { PluginActivate } from '@agent-mc/plugin-sdk'
import { createCommandChannel } from '@agent-mc/plugin-sdk/commands'
import { commands } from './commands'

const activate: PluginActivate = (ctx) => {
  createCommandChannel(ctx, { name: 'mail', commands })
  return {}
}
export default activate
```

**Panel** — one client per channel. With `CommandMapOf`, inputs and results are typed from the
backend's own definitions.

```typescript
import { createCommandClient, CommandError, type CommandMapOf } from '@agent-mc/plugin-sdk/commands'
import type { commands } from '../backend/commands'

const mail = createCommandClient<CommandMapOf<typeof commands>>('mail')

try {
  const { sentAt } = await mail.run('sendDraft', { draftId: 'd1' }, {
    onPending: ({ waiting, runningForMs }) => showProgress(waiting, runningForMs),
  })
} catch (err) {
  if (err instanceof CommandError) showError(err.code, err.message)
}
```

The client reads `window.AgentMC.backend` when a command runs. A panel without a bundler can copy
`client.js`, `protocol.js` and `errors.js` from `node_modules/@agent-mc/plugin-sdk/dist/commands/`
and load `client.js` as an ES module: the three files import nothing else.

## Errors

Every failure is a `CommandError` whose `code` says what is known about whether the command ran.

| Code | What happened | Did it run? |
|---|---|---|
| `host-too-old` | This Omniscio has no panel-to-backend channel (before v0.1.92) | No — nothing was sent or written |
| `worker-not-ready` | The backend is not running, or is an older build without this channel | No |
| `refused` | Turned away: full queue, input over the limit, a busy host, or a saved command dropped after an update | No |
| `invalid-input` | The input is not plain JSON data, or `parse` rejected it (its message is passed through) | No |
| `failed` | It ran and threw (the error's message is passed through), or ran but its result could not be sent back | Yes |
| `outcome-unknown` | Contact was lost after the backend may have accepted it, and it did not come back within a minute | Maybe — never retry it blindly |

## How commands run

- **Writes run one at a time, in arrival order.** `mode` defaults to `'write'`.
- **Reads (`mode: 'read'`) run alongside each other**, up to `maxParallelReads`.
- **Results are handed over once.** A finished result nobody collects is dropped after `resultTtlMs`.
- **Inputs and results are plain JSON data.** They cross a JSON boundary inside Omniscio: a `Date`
  arrives as a string. Send ids, not documents.
- **Nothing is logged except the fact that a command failed** (its type and id, never its data).

| Limit (`limits`) | Default | Beyond it |
|---|---|---|
| `maxQueued` | 50 | New commands are `refused` |
| `maxParallelReads` | 4 | Reads wait their turn |
| `maxInputBytes` | 64 KiB of JSON | The command is `refused` |
| `resultTtlMs` | 10 minutes | An uncollected result is dropped |

**Long commands are fine.** The panel checks in about every 15 seconds, so a command can run for as
long as it needs. A command has no time limit, because nothing can stop a promise that is already
running.

**A stuck command holds the queue.** While a write never finishes, later writes wait (they are not
run and not lost), and each status answer says how long the stuck one has been running:
`onPending` receives `{ waiting: 'queued', runningForMs }`. To clear it, restart the plugin
(disable and re-enable it, or restart Omniscio). Without `durable`, the waiting commands are then
gone and their panels are told `outcome-unknown`; with it, they resume.

## Surviving a restart: `durable: true`

```typescript
createCommandChannel(ctx, { name: 'mail', commands, durable: true })
```

- **A waiting command survives a restart.** Each accepted command keeps one private copy in
  `ctx.storage` (declare the `storage` permission). When the plugin starts again, the waiting
  commands run, in their original order.
- **A started command never runs twice.** Its copy is deleted just before it runs, so a crash
  mid-run cannot repeat it. If the copy is gone or cannot be deleted, the command is `refused`
  instead of run.
- **An update can refuse a saved command.** If the new version's `parse` rejects a saved input,
  the command is dropped without running and its waiting panel is told `refused`.
- **The panel waits through the restart.** While the backend is away, the panel keeps asking for
  up to a minute, so it hears the real outcome.
- **Durable inputs must stay under 1 MiB.** Omniscio stores at most 1 MiB per value, so
  `maxInputBytes` cannot go higher.

## Commands from your own code

`channel.submit(type, input)` runs a command from your backend code — for example a CLI endpoint
you declared with `requiresConfirmation`, which Omniscio approves with the person first. It goes
through the same checks, queue and limits, and resolves with the result or rejects with a
`CommandError`.

```typescript
const channel = createCommandChannel(ctx, { name: 'mail', commands })
ctx.cli.handle('/send', async (req) => ({ status: 200, body: await channel.submit('sendDraft', req.body) }))
```

## Moving off a command table

1. Move each command type onto the channel; the panel calls `run` instead of inserting a row.
2. Stop reading the old table as instructions — no drain, no cron, no "process pending" step.
3. Call `channel.retireRows('commands')` when the plugin starts. It settles every row still marked
   `pending`, `queued` or `running` (status → `'error'`, optionally a note in `noteColumn`) without
   running anything; a row someone re-arms later is settled again at the next start.
4. Remove the table, or reduce it to a job list that describes rather than instructs: `label`,
   `status`, `error` and times — never an instruction, its arguments and a status together.
5. Set `plugin.minAppVersion` to `"0.1.92"` so the store offers the plugin only where the channel
   exists.

## Older Omniscio versions

- **The channel needs Omniscio v0.1.92** (`ctx.rpc` and `AgentMC.backend.invoke`). On older hosts
  the client throws `host-too-old` and writes nothing; the backend logs one warning, keeps running,
  and `submit` still works.
- **The plugin-table fence (`agentWritable`) only exists on newer Omniscio builds.** Older builds
  ignore the key and leave every table writable from outside, so on those the channel is the only
  thing that protects the person. See [Outside writes](./manifest#outside-writes-agentwritable).

## Testing it

`@agent-mc/plugin-sdk/testing` has two pieces for this:

- **`createRpcDouble()`** — a stand-in for Omniscio's channel. Pass `rpc` to
  `createTestContext({ rpc })` and `backend` to `createCommandClient(name, { backend })`. It makes
  the same JSON round trip as Omniscio and fails with Omniscio's own messages; `setStopped(true)`
  simulates a stopped backend.
- **`describeForgedRowsAreInert()`** — the test that matters. It runs each of your commands once
  through the channel (and fails if your `effects` probe cannot see it run), then forges, edits and
  re-arms rows of every command type in every table your manifest declares. Then it fires every cron,
  the start-up hooks, a second round of commands and a restart on the same data, and fails if
  anything extra happened.

```typescript
import { describe, it } from 'vitest'
import { describeForgedRowsAreInert } from '@agent-mc/plugin-sdk/testing'
import manifest from '../manifest.json'
import activate from '../src/backend'

const sent: string[] = []

describeForgedRowsAreInert({ describe, it }, {
  manifest,
  activate,
  channel: 'mail',
  commands: [{ type: 'sendDraft', input: { draftId: 'd1' } }],
  context: { fetch: async (url) => (sent.push(String(url)), new Response('{}')) },
  effects: () => sent.length,
})
```

If your backend polls on a timer, use fake timers and pass a `settle` that lets the time pass (for
example `() => vi.advanceTimersByTimeAsync(60_000)`); the check cannot advance time by itself.

## The ship check

`amc-plugin validate`, `preflight` and `publish` fail when a table your manifest declares can hold a
runnable command: an instruction column, an argument column and a status column together, such as
`type` + `payload` + `status`. Fuzzier shapes only warn. A table that is genuinely safe can carry a
written `commandTableWaiver`. The rule, its warnings and what it cannot see are in the
[CLI reference](../reference/cli#command-tables).

## What this does not protect

- **Reads.** Agents can still read every table your plugin declares; nothing here hides data.
- **A plugin that keeps acting on rows** by its own code, channel or not.
- **Anyone who controls the person's screen or disk.** They can act as the person.
- **Anything the ship check cannot see:** see its limits in the [CLI reference](../reference/cli#command-tables).
