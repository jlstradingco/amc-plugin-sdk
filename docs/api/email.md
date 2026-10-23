# Email

Send one email at a time from the user's agent address, sent by the host with no AI session on the path.

**Availability:** Backend only (`ctx.email`), on hosts that ship it — read it as `ctx.email?.send(...)`
**Required Permission:** `email.send` (Tier-1 **elevated**)

## What the plugin does not control

- **The sender.** Mail always goes out from the user's own claimed agent address. A plugin cannot set
  From, Reply-To, Cc, Bcc or any header; a call naming one is refused with `invalid-input`.
- **The recipients.** Exactly one address per call. Mail a list by calling `send` once per reader.
- **Unsubscribe.** Every email is sent as list mail with a one-click unsubscribe the mail service adds.
  Anyone who unsubscribed from the user's agent address, bounced or complained is never mailed again,
  and the call tells you so.
- **The HTML.** The host cleans the body before it leaves: scripts, forms, inputs, frames, embedded
  objects, event handlers and `javascript:` / `data:` links are removed. Document structure, `<style>`
  blocks, `class` attributes, inline styles (without `url()`), tables, images and `https` / `mailto`
  links survive. A body that is empty after cleaning is refused with `invalid-input`.
- **Volume.** Each plugin may send a burst of 10, then one more per second, and at most 500 a day
  (local day). The user's agent-email plan limits apply on top.

## Methods

### `send(message: PluginEmailMessage): Promise<PluginEmailSendResult>`

```typescript
interface PluginEmailMessage {
  to: string
  subject: string
  html: string
  idempotencyKey?: string
}

type PluginEmailSendResult =
  | { ok: true; id: string; deduped: boolean }
  | { ok: false; reason: PluginEmailFailureReason }
```

A refusal is **not** a rejection: every outcome resolves, so branch on `ok`. `id` is the mail
service's message id. `deduped: true` means the service recognised the send as a repeat of one it
already delivered and named that message.

`subject` is one line (no line breaks), at most 200 characters. `html` is at most 100,000 characters.

#### `idempotencyKey`

Pass a stable key per (message, reader) — for a newsletter, `<issueId>:<address>` — and a retry of
the same key is sent once. The host hashes the key and prefixes it with your plugin id before it
reaches the mail service, so it never appears in a log and never collides with another plugin's key.

### Reasons

| `reason` | Meaning | What to do |
| --- | --- | --- |
| `invalid-input` | A field is missing, too long, or not allowed, or the body was empty after cleaning | Fix the call; do not retry as is |
| `not-set-up` | The user has not claimed an agent email address, or is signed out | Ask the user to set up agent email |
| `rate-limited` | The per-plugin burst is used up | Wait a second and retry |
| `plugin-daily-cap` | This plugin has sent 500 today (UTC day, counted in the cloud for sent and scheduled mail together) | Stop until tomorrow |
| `duplicate` | The mail service merged this send into an earlier one without naming it | Treat the earlier send as the delivery |
| `recipient-unsubscribed` | The reader used one-click unsubscribe | Remove the reader |
| `recipient-rejected` | The reader bounced or reported spam | Remove the reader |
| `daily-send-cap` | The user's agent-email plan hit its daily send limit | Stop until tomorrow |
| `recipient-limit` | The plan's daily limit of distinct recipients is reached | Stop until tomorrow |
| `address-unavailable` | The user's agent address cannot send | Ask the user to check agent email |
| `account-suspended` | Sending is disabled for this account | Stop |
| `server-error` | The mail service could not be reached or failed | Retry later with the same `idempotencyKey` |

## Example

```typescript
for (const reader of readers) {
  const result = await ctx.email?.send({
    to: reader.address,
    subject: issue.title,
    html: issueHtml,
    idempotencyKey: `${issue.id}:${reader.address}`
  })
  if (!result) break
  if (result.ok) continue
  if (result.reason === 'recipient-unsubscribed' || result.reason === 'recipient-rejected') {
    await removeReader(reader)
  } else if (result.reason === 'rate-limited') {
    await new Promise((r) => setTimeout(r, 1000))
  } else {
    break
  }
}
```

## Scheduled sends

Prepare an issue while the app is open and hand it to Omniscio's cloud with a send time. The cloud
sends it on time even when the computer is off, and you can cancel it until it goes.

### `schedule(issue: PluginEmailIssue): Promise<PluginEmailScheduleResult>`

```typescript
interface PluginEmailIssue {
  to: string[]
  subject: string
  html: string
  sendAt: string
  idempotencyKey?: string
}
```

- `to`: 1 to 2000 addresses; duplicates are removed, ignoring case.
- `sendAt`: an ISO-8601 UTC time (`2026-10-22T09:00:00.000Z`) at least one minute and at most 30 days ahead.
- Every `send` rule applies: same permission, the user's agent address as sender, one-click
  unsubscribe on every email, the HTML cleaning, and a hashed `idempotencyKey` (the same key returns
  the same schedule).
- Answers `{ ok: true, scheduleId, sendAt, recipients }` or `{ ok: false, reason }`.

At the send time the cloud sends to each reader through the same checks as a live send, evaluated
at that moment: a reader who unsubscribed or bounced after you scheduled is skipped. The issue and
the readers' addresses are stored in Omniscio's cloud only until the issue has been sent, then
deleted automatically.

### `cancel(scheduleId)`, `status(scheduleId)`, `list()`

- `cancel` stops every reader not yet sent and deletes the issue; answers `{ ok: true }` or
  `not-found` / `already-sent`. A cancelled issue is gone, so `status` then answers `not-found`;
  the `cancelled` state is reserved and you will not see it today.
- A schedule id is letters, digits and dashes (up to 128); anything else is `invalid-input`.
- `status` answers `{ ok: true, schedule }`; `list` answers `{ ok: true, schedules }` for this plugin
  only.

```typescript
interface PluginEmailSchedule {
  scheduleId: string
  state: 'scheduled' | 'sending' | 'continuing' | 'held' | 'sent' | 'cancelled' | 'failed'
  sendAt: string
  total: number
  sent: number
  remaining: number
  unsubscribed: string[]
  rejected: string[]
  failed: number
  nextAttemptAt: string | null
  subject?: string | null
}
```

`subject` is the issue's subject while it is waiting; it is `null` once the issue has finished and
its content was deleted.

### When your plugin goes away

- If the user uninstalls or disables your plugin, or an update removes `email.send`, every issue it
  has waiting is cancelled. If the plugin store removes it, its waiting issues are `held`: nothing
  is sent until the user chooses Send or Cancel in Settings > Plugins.
- The user can also cancel any waiting issue from your plugin's card, so read `status` or `list`
  when your plugin starts and treat a missing issue as cancelled.

### Daily limits and the notices you show

- A plugin may send at most 500 emails a day, scheduled and immediate together, and at most 80% of
  the account's own daily email allowance, so the user's own agent mail always has room. On the
  free plan that is 80 sends and 20 new readers a day.
- When a limit stops an issue part-way, its state becomes `continuing` and the rest go out
  automatically just after the next UTC midnight (`nextAttemptAt`). Read `status` or `list` when
  your plugin starts and tell the user with `ctx.inbox.postAlert` (for example "Issue 8 reached 20
  of 60 readers today; the rest go out tomorrow").
- If your app was closed past the time you meant to hand an issue over, `schedule` answers
  `send-at-passed`. Send it now with `send`, and tell the user it went out late.
- Remove readers listed in `unsubscribed` and `rejected` from your list.

### Scheduling reasons

| `reason` | Meaning |
| --- | --- |
| `invalid-input` | A field is missing, not allowed, or the body was empty after cleaning |
| `not-set-up` | No agent email address, or signed out |
| `send-at-passed` | The send time is less than a minute away or in the past |
| `send-at-too-far` | The send time is more than 30 days away |
| `too-many-recipients` | More than 2000 readers |
| `schedule-limit` | This plugin already has 20 issues waiting |
| `not-found` / `already-sent` | `cancel` or `status` for an issue that is gone or already finished |
| `not-available` | This Omniscio's cloud does not offer scheduled sends yet |
| `server-error` | The cloud could not be reached; try again later |

## Testing

`createTestContext()` records every send in `harness.sentEmails` and answers `{ ok: true }`. Pass
`email: (message) => ({ ok: false, reason: 'recipient-unsubscribed' })` to drive any reason.

Scheduled issues land in `harness.scheduledEmails`, and `cancel`, `status` and `list` read them.
Edit an entry (for example set `state: 'continuing'`) to test the notice your plugin shows.
