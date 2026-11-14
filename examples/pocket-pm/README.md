# Pocket PM

A small project manager. It reads a board and a task list you pick, checks who is away this week
and what is on your calendar today, lets you nudge a stuck session, and drafts a Team Chat update
that waits for your approval before it is posted.

## Requirements

Requires `@omniscio/plugin-sdk` 3.6.0 or newer.

This example declares `tasks.read`, `people.read`, `calendar.read`, `sessions.control`,
`teamChat.read` and `teamChat.write`. No published kit carries those permissions yet: `npm install`
today brings 3.5.0, so the published CLI refuses this manifest with `Manifest validation failed`.
Build it from this repository's workspace, or wait for the kit release that publishes them.

## What It Shows

**Panel (webview):** one button per picker, so the person chooses exactly what the plugin may see:

- `Omniscio.boards.requestAccess()` - pick a board
- `Omniscio.tasks.requestAccess()` - pick a task list
- `Omniscio.calendar.requestAccess()` - pick calendars
- `Omniscio.sessionControl.requestAccess()` - pick sessions or projects
- `Omniscio.teamChat.requestAccess()` - pick Team Chat channels and choose how posts appear

The panel calls its worker through `Omniscio.backend.invoke(...)` and shows the result read-only.

**Worker (backend):** handlers registered with `ctx.rpc.handle`:

- `buildUpdate()` reads the first picked board's items (`ctx.boards.listItems`), the not-done
  tasks due by the end of today on the first picked list (`ctx.tasks.list`), who is away this week
  (`ctx.people.timeOff.list`), today's events on the picked calendars (`ctx.calendar.events.list`),
  and the picked sessions that are waiting on you or stuck (`ctx.sessionControl.list`). It returns a
  few short lines of plain text and the list of stuck sessions. It never posts anything.
- `listChannels()` lists the picked Team Chat channels (`ctx.teamChat.channels.list`) for the
  channel menu.
- `nudge(sessionId)` sends a short check-in to a stuck session (`ctx.sessionControl.message`).
- `postUpdate(channelId, text)` posts the update (`ctx.teamChat.messages.post`).

Every change answers a typed result, `{ ok: true, value }` or `{ ok: false, code }`. The worker turns
each code (`DECLINED`, `NOT_FOUND`, `RATE_LIMITED` and the rest) into a plain sentence for the panel.

A session counts as waiting on you when its status is `needs_you`, and as stuck when it is
`stalled` or `error`. Only stuck sessions get a Nudge button.

## Every Post and Nudge Asks First

Pocket PM never sends anything by itself. Before a Team Chat post or a session nudge goes out,
Omniscio shows its own question with the whole text, and only your "yes" lets it through. Saying no
answers `DECLINED`, and the panel tells you nothing was sent.

## Works on Older Omniscio Versions

Every worker namespace is optional. When one is missing, the update says, for example, "This
Omniscio version does not support calendars yet." instead of failing, and a read that is refused
(for example because its Labs switch is off) shows its reason on its own line while the other lines
still fill in. When the panel has no `Omniscio.backend`, it says so in plain words and turns off
the build button.

## Permissions

| Permission | Why |
|---|---|
| `boards.read` | Pick a board and read its items |
| `tasks.read` | Pick a task list and read the tasks that are due |
| `members.read` | Required by `people.read` |
| `people.read` | See who is away this week |
| `calendar.read` | Pick calendars and read today's events |
| `sessions.control` | Pick sessions, see which are stuck, and nudge one (asks first) |
| `teamChat.read` | Pick Team Chat channels and list them |
| `teamChat.write` | Post the update (asks first) |

`sessions.control` needs no other permission, so the manifest does not declare
`sessions.observeStatus`: the session status comes from `ctx.sessionControl.list()`.

Each of these works only after the person turns on the matching Labs switch: Plugin access to boards
and tasks, Plugin access to people's schedules, Plugin access to your calendars, Plugin control of
your sessions, and Plugin access to Team Chat.

## Running

```bash
cd examples/pocket-pm
npm install
npm run build
npm run dev
```

Note: The dev shell uses mock APIs. Real boards, tasks, calendars, sessions and Team Chat need the
plugin installed in Omniscio.
