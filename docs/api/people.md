# People

See when the people in the user's workspace work and when they are away, from your plugin's backend.

**Availability:** Backend only (`ctx.people`). A panel call is refused; reach it from your UI through `backend.invoke`.
**Required Permission:** `people.read`, and it **requires** `members.read` in the same manifest.

::: tip Never more than the user can see
Your plugin sees exactly what the user would see in Mission Control, and nothing more. An admin or a project lead sees everyone's working hours; anyone else sees only their own. Why someone is away is shown only for the user's own days, or for everyone's when the user is an admin, and never when the person kept the reason private. Email addresses and roles are never returned.
:::

::: tip Available when the person turns it on
The People API is available when the person has turned on **Plugin access to people's schedules** in Labs. Until then, every call rejects with "This feature is not available."
:::

## Permissions

`people.read` is a standard permission. Omniscio describes it to the user as "People's schedules: See when the people in your workspace work and when they are away."

```json
{
  "permissions": ["members.read", "people.read"]
}
```

A manifest that lists `people.read` without `members.read` is rejected.

## Backend methods

Each method is on `ctx.people`. Reads are limited to 60 a minute per plugin, shared with the other work-data reads; a faster call rejects with `RATE_LIMITED`. Every read is written to the host's read log, which the user can review. When Mission Control is not available (for example, the user is not signed in), a call rejects with "Mission Control is not available." rather than answering an empty list. A read that fails for an unexpected reason rejects with "Something went wrong. Try again."

### `schedules.list(): Promise<PluginPersonSchedule[]>`

The working days and hours of each person the user may see, sorted by name. A person with no working hours set is left out.

**Returns:** `Promise<PluginPersonSchedule[]>`

### `timeOff.list(query: PluginTimeOffQuery): Promise<PluginPersonTimeOff[]>`

The days away that overlap the range, for everyone in the workspace, earliest first.

| Name | Type | Description |
|---|---|---|
| `query.from` | `string` | The first day, written `YYYY-MM-DD` |
| `query.to` | `string` | The last day, written `YYYY-MM-DD`; on or after `from`, at most 366 days in all |

**Returns:** `Promise<PluginPersonTimeOff[]>`

**Rejects** when a day is not a real calendar day, when `from` is after `to`, or when the range is longer than 366 days.

## Types

```typescript
interface PluginPersonSchedule {
  memberId: string
  name: string
  weekdays: number[]   // 0 is Sunday, 6 is Saturday
  hoursPerDay: number
}

interface PluginTimeOffQuery {
  from: string         // YYYY-MM-DD
  to: string           // YYYY-MM-DD
}

type PluginTimeOffReason = 'vacation' | 'leave' | 'sick' | 'other'

interface PluginPersonTimeOff {
  memberId: string
  name: string
  startDate: string    // YYYY-MM-DD
  endDate: string      // YYYY-MM-DD
  shareAway: 100 | 50  // 100 for the whole day, 50 for half of it
  reason: PluginTimeOffReason | null   // null whenever the user may not see why
}
```

## Example

In the backend, find who is away next week:

```typescript
import type { PluginContext } from '@omniscio/plugin-sdk'

export async function awayNextWeek(ctx: PluginContext, from: string, to: string): Promise<string[]> {
  const away = await ctx.people!.timeOff.list({ from, to })
  return [...new Set(away.map((entry) => entry.name))]
}
```

## Notes

- `ctx.people` is optional on `PluginContext`, so a context double written before the SDK typed it still compiles. Use `ctx.people!` or check for it first.
- Nothing is picked or granted: the permission and the Labs switch are the whole of it.
- The answer never carries an email address, a role, whether someone is an admin, where a day away came from, or the id of a day away.
