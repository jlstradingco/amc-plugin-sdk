# Calendar

Ask the user which Google and Outlook calendars your plugin may use, then read their events and free or busy time, and add, edit and delete events from your plugin's backend.

**Availability:** The webview (`Omniscio.calendar`) opens the picker: `requestAccess()`. The backend (`ctx.calendar`) reads (`calendars.list`, `events.list`, `freeBusy`) and changes events (`events.create`, `events.update`, `events.delete`). `requestAccess()` is on the webview only.
**Required Permission:** `calendar.read` for the picker and the three reads. `calendar.write` for the three changes, and it **requires** `calendar.read` in the same manifest.

::: tip Default-deny
Declaring `calendar.read` grants nothing by itself. Your plugin sees no calendar until the user picks one, or picks "All your calendars", in the picker that `requestAccess()` opens. A calendar that was not picked and a calendar that does not exist answer the same way, so a plugin cannot probe for calendars it was not given.
:::

::: tip Available when the person turns it on
The whole Calendar API is available when the person has turned on **Plugin access to your calendars** in Labs and at least one calendar is connected: Google Calendar, or Outlook through Microsoft Teams. Until then, reads and `requestAccess()` reject with "This feature is not available." and a change resolves `{ ok: false, code: 'FEATURE_OFF' }`.
:::

## Permissions

`calendar.read` and `calendar.write` are both elevated permissions. Omniscio describes them to the user as:

- "Calendars: Read events, guests and meeting links on the calendars you choose."
- "Change calendar events: Change events on the calendars you choose. Inviting people or deleting asks you first."

```json
{
  "permissions": ["calendar.read", "calendar.write"]
}
```

A manifest that lists `calendar.write` without `calendar.read` is rejected.

The user can review each grant, and every change your plugin made, in the same review panel as other plugin grants. They can revoke a grant there. Disabling or uninstalling the plugin revokes them.

## Which calendars a plugin gets

A calendar id is the provider and the provider's own id, joined by a colon: `google:<id>` or `outlook:<id>`. Treat it as an opaque string. An event id is the provider's own event id and is always used together with its calendar id.

A grant is one of these:

- **One calendar.**
- **All your calendars**, which covers every calendar of each connected provider, including calendars the user adds later.

The picker only offers calendars whose events the user can read. A calendar the user can only see as free or busy is never listed and its events are never returned; `freeBusy` can still answer for it under an "All your calendars" grant.

`canWrite` on each calendar says whether your plugin may change it. It is `true` only when the user themselves can change the calendar (Google owner or writer, an Outlook calendar they can edit) and, for Outlook, only after the user turns on **Let plugins change Outlook calendars** under Microsoft Teams. When it is `false`, `readOnlyReason` is a short sentence you can show the user.

## Webview methods

### `requestAccess(): Promise<PluginCalendarAccessOutcome>`

Open Omniscio's calendar picker so the user can choose what your plugin may use. Resolves when the picker closes.

**Returns:** `Promise<PluginCalendarAccessOutcome>`. When the user closes the picker without choosing, `cancelled` is `true`; `allCalendars` and `calendars` still hold anything picked earlier. `calendars` lists the calendars picked one by one.

The picker offers up to 100 calendars. Omniscio shows one grant picker at a time, so open yours from a button the user pressed, and do not call `requestAccess()` again until it resolves.

## Backend methods

Each backend method is on `ctx.calendar`. Reads are limited to 60 a minute per plugin, and changes to 10 a minute per plugin. A read that fails for an unexpected reason rejects with "Something went wrong. Try again."

### `calendars.list(): Promise<PluginCalendarView[]>`

The calendars your plugin may read, with their name, provider, whether each is the user's main calendar, and whether your plugin may change it. Empty until the user has picked something.

---

### `events.list(query: { calendarId: string; from: string; to: string }): Promise<PluginCalendarEventsPage>`

The events on one calendar that overlap the range, as the user sees them. `from` and `to` are ISO 8601 date-times with a time zone (`Z` or an offset). `to` must be after `from` and at most 90 days later. A recurring event comes back as one event per occurrence, each with its `recurringEventId`.

At most 250 events come back. When `truncated` is `true`, more may exist: ask again with a shorter range.

A calendar that is not picked, does not exist, or whose events the user cannot read rejects with "Calendar not found".

---

### `freeBusy(query: { calendarIds: string[]; from: string; to: string }): Promise<PluginCalendarFreeBusy>`

The busy time on 1 to 20 calendars over the same kind of range. Each busy block has a `start` and an `end`. If any calendar in the list is not available to your plugin, the whole call rejects with "Calendar not found" and nothing is read.

---

### `events.create(calendarId: string, event: PluginCalendarEventInput, options?: { notifyGuests?: boolean }): Promise<PluginWriteResult<PluginCalendarEvent>>`

Add an event. `start` and `end` are ISO 8601 date-times with a time zone, or, with `allDay: true`, dates (`YYYY-MM-DD`) where `end` is the day after the last day. `attendees` holds up to 50 guests.

Pass a `requestId` that is the same every time you retry the same booking. Omniscio turns it into an idempotency key, so a retried create never books twice. Without one, every call is a new event.

**Asks only when the event invites guests.** On Google, guests are emailed only when you pass `notifyGuests: true` and the user agrees; otherwise nobody is emailed. Outlook always emails guests, and the question says so.

---

### `events.update(calendarId: string, eventId: string, patch: PluginCalendarEventPatch, options?: { notifyGuests?: boolean }): Promise<PluginWriteResult<PluginCalendarEvent>>`

Change some fields of an event. Send `start` and `end` together, and `allDay` with them when the event is all-day. `attendees` replaces the whole guest list.

**Asks when the guest list changes**, naming who is added and who is removed, and for one occurrence of a recurring event, its date. Google guests are emailed about that change only when you pass `notifyGuests: true` and the user agrees.

---

### `events.delete(calendarId: string, eventId: string): Promise<PluginWriteResult<{ id: string }>>`

Delete an event. An occurrence id removes only that occurrence; the series id removes the whole series, and the question says which.

**Asks the user first, every time.** Google guests are not notified. Outlook sends the guests a cancellation, and the question says so.

## Asking first

The question is written by Omniscio from its own records: your plugin's name, the event, the calendar and the guests. Your plugin cannot word it. The change happens only after the user allows it, and Omniscio checks the grant again after the answer. Saying no, closing the dialog or not answering resolves `DECLINED` and changes nothing. Only one question per plugin can be open at a time.

Adding or editing an event with no change to its guests never asks.

## Results and refusals

A change never throws because it was refused. It resolves `{ ok: false, code }`, so check `ok` before you use `value`.

| `code` | What it means |
|---|---|
| `FEATURE_OFF` | The user has not turned on Plugin access to your calendars, or no calendar is connected |
| `NOT_FOUND` | The calendar or event does not exist or is not available to your plugin. These look the same on purpose |
| `FORBIDDEN` | Your plugin may not change this calendar. Read `canWrite` and `readOnlyReason` from `calendars.list` to tell the user why |
| `INVALID` | The calendar service refused the event as written |
| `CONFLICT` | The event changed or clashed at the calendar service. Read it again before you retry |
| `RATE_LIMITED` | More than 10 changes in a minute |
| `DECLINED` | The user said no when asked |
| `BUSY` | The user is already looking at another question from your plugin |
| `FAILED` | Something unexpected went wrong. Nothing is promised about whether the change happened; read the calendar again before you retry |

## Types

```typescript
type PluginCalendarProvider = 'google' | 'outlook'

interface PluginCalendarView {
  id: string
  name: string
  provider: PluginCalendarProvider
  primary: boolean
  canWrite: boolean
  /** A sentence you can show the user when `canWrite` is false. */
  readOnlyReason: string | null
}

interface PluginCalendarEvent {
  id: string
  calendarId: string
  title: string
  description: string | null
  location: string | null
  /** An ISO 8601 date-time, or a date for an all-day event. */
  start: string
  end: string
  allDay: boolean
  status: string
  organizer: { name: string | null; email: string } | null
  attendees: { name: string | null; email: string; response: 'accepted' | 'declined' | 'tentative' | 'needsAction' }[]
  meetingLink: string | null
  recurringEventId: string | null
  link: string | null
}

interface PluginCalendarEventsPage {
  events: PluginCalendarEvent[]
  /** `true` when the 250-event cap was reached. */
  truncated: boolean
}

interface PluginCalendarFreeBusy {
  calendars: { calendarId: string; busy: { start: string; end: string }[] }[]
}

interface PluginCalendarEventInput {
  title: string
  description?: string
  location?: string
  start: string
  end: string
  allDay?: boolean
  attendees?: { email: string; name?: string }[]
  /** The same value on every retry of the same booking. */
  requestId?: string
}

type PluginCalendarEventPatch = Partial<Omit<PluginCalendarEventInput, 'requestId'>>

interface PluginCalendarAccessOutcome {
  cancelled: boolean
  allCalendars: boolean
  calendars: { id: string; name: string; provider: PluginCalendarProvider }[]
}
```

## Example

In the backend, book a focus block on the first calendar your plugin may change, and retry safely:

```typescript
import type { PluginContext } from '@omniscio/plugin-sdk'

export async function bookFocus(ctx: PluginContext, start: string, end: string): Promise<void> {
  const calendar = (await ctx.calendar!.calendars.list()).find((c) => c.canWrite)
  if (!calendar) return
  const result = await ctx.calendar!.events.create(calendar.id, {
    title: 'Focus time',
    start,
    end,
    requestId: `focus-${start}`
  })
  if (!result.ok) ctx.log.warn(`Could not book focus time: ${result.code}`)
}
```

## Notes

- `ctx.calendar` is optional on `PluginContext`, so a context double written before the SDK typed it still compiles. Use `ctx.calendar!` or check for it first.
- Events, guests and meeting links are only ever returned to your backend. The webview can open the picker and see the names of the calendars that were shared, never an event.
- Your plugin never reaches the calendar AI chat or the paid quick-add parser.
