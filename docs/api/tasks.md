# Tasks

Ask the user which of their task lists your plugin may use, then read those lists and change their tasks from your plugin's backend.

**Availability:** The webview (`Omniscio.tasks`) lists the task lists the user shared and opens the picker: `listLists()` and `requestAccess()`. The backend (`ctx.tasks`) lists them too, reads tasks (`list`, `get`), and changes them (`create`, `update`, `complete`, `reorder`, `archive`, `restore`, `delete`).
**Required Permission:** `tasks.read` for everything on this page. The seven changes on the backend also need `tasks.write`.

::: tip Default-deny
Declaring `tasks.read` grants nothing by itself. Your plugin sees no task list until the user picks it in the picker that `requestAccess()` opens. A list that is not shared, and a list that does not exist, answer the same way, so a plugin cannot probe for lists it was not given.
:::

::: tip Available when the person turns it on
The whole Tasks API is available when the person has turned on **Plugin access to boards and tasks** in Labs. Until then, a read rejects with "This feature is not available." and a change resolves `{ ok: false, code: 'FEATURE_OFF' }`.
:::

## Permissions

`tasks.read` is a standard permission. Omniscio describes it to the user as "Tasks: Read the task lists you choose, including their tasks, due dates and status."

`tasks.write` is an elevated permission. Omniscio describes it as "Change tasks: Add, edit, complete, move, archive and restore tasks in the task lists you choose. Deleting a task asks you first." It **requires** `tasks.read` in the same manifest.

```json
{
  "permissions": ["tasks.read", "tasks.write"]
}
```

The user can review each list grant, and every change your plugin made, in the same review panel as other plugin grants. They can revoke a grant there. Disabling or uninstalling the plugin revokes them.

## Which lists a plugin gets

The picker lets the user choose individual lists, or **All lists, including new ones**. With the all-lists choice your plugin also sees lists the user creates later, and tasks that sit on no list. With individual lists it sees only those lists, and never a task that sits on no list.

A grant belongs to the account that made it. If the user signs in as someone else, your plugin sees nothing until that account shares lists with it.

Moving a task to another list needs both the list it leaves and the list it enters to be shared. Subtasks follow their parent's list.

## Webview methods

### `listLists(): Promise<PluginTaskListView[]>`

The lists this plugin may currently use, each with its `id` and `name`.

**Returns:** `Promise<PluginTaskListView[]>`. The array is empty until the user has shared a list.

---

### `requestAccess(): Promise<PluginTaskAccessOutcome>`

Open Omniscio's task list picker so the user can choose which lists to share. Resolves when the picker closes, with every shared list, so no second call to `listLists()` is needed.

**Returns:** `Promise<PluginTaskAccessOutcome>`. When the user closes the picker without choosing, `cancelled` is `true`; `lists` still holds anything shared earlier. `allLists` is `true` when the user chose All lists, including new ones.

## Backend methods

Each backend method is on `ctx.tasks`. Reads are limited to 60 a minute per plugin, and changes to 10 a minute per plugin. A read that fails for an unexpected reason rejects with "Something went wrong. Try again."

### `listLists(): Promise<PluginTaskListView[]>`

The lists this plugin may currently use. The same list the webview sees.

---

### `list(query?: PluginTasksQuery): Promise<PluginTasksPage>`

One page of tasks from the shared lists, in the order the user sees them.

| Name | Type | Description |
|---|---|---|
| `query.listId` | `string` | Optional. Only tasks on this list. Without it you get tasks from every list you may use |
| `query.done` | `boolean` | Optional. Only done tasks, or only tasks that are not done |
| `query.archived` | `boolean` | Optional. `true` for only archived tasks. Archived tasks are left out otherwise |
| `query.dueBefore` | `string` | Optional. An ISO 8601 date-time. Only tasks due at or before it |
| `query.limit` | `number` | Optional, 1 to 200. Defaults to 50 |
| `query.cursor` | `string` | Optional. The `nextCursor` of the previous page |

**Returns:** `Promise<PluginTasksPage>`. `nextCursor` is `null` on the last page.

**Rejects** with "Task list not found" when `query.listId` is not shared with your plugin or does not exist.

---

### `get(id: string): Promise<PluginTaskView>`

One task, archived or not.

**Rejects** with "Task not found" when the task does not exist or sits on a list that is not shared with your plugin.

---

### `create(input: PluginTaskInput): Promise<PluginWriteResult<{ id: string }>>`

Add a task. `input.listId` is required: pass a shared list's id, or `null` for a task on no list (which needs the all-lists choice). `input.text` is 1 to 2,000 characters.

---

### `update(id: string, patch: PluginTaskPatch): Promise<PluginWriteResult<{ id: string }>>`

Change a task's text or due date, or move it to another shared list. Give at least one of `patch.text`, `patch.dueAt` (`null` clears the due date) and `patch.listId`. A task cannot be moved onto no list. A move has to be made on its own: a patch that sets `listId` together with `text` or `dueAt` resolves `INVALID` and changes nothing, so move the task in one call and edit it in another.

---

### `complete(id: string, done: boolean): Promise<PluginWriteResult<{ id: string }>>`

Mark a task done with `true`, or not done with `false`.

---

### `reorder(id: string, place: PluginTaskReorder): Promise<PluginWriteResult<{ id: string }>>`

Put a task right after `place.afterId` or right before `place.beforeId`. Give one, not both. The other task has to be on the same list and at the same level, and has to be shared with your plugin.

---

### `archive(id: string): Promise<PluginWriteResult<{ id: string }>>`

Archive a task.

---

### `restore(id: string): Promise<PluginWriteResult<{ id: string }>>`

Bring an archived task back.

---

### `delete(id: string): Promise<PluginWriteResult<{ id: string }>>`

Delete a task for good.

**Asks the user first, every time.**

## Results and refusals

A change never throws because it was refused. It resolves `{ ok: false, code }`, so check `ok` before you use `value`.

| `code` | What it means |
|---|---|
| `FEATURE_OFF` | The user has not turned on Plugin access to boards and tasks |
| `NOT_FOUND` | The task or list does not exist, is not the signed-in user's, or is not shared with your plugin. These all look the same on purpose |
| `FORBIDDEN` | The user themselves may not make this change |
| `INVALID` | The change does not fit: text or a date in the wrong shape, an attempt to move a task onto no list, or a move combined with a text or due date change (move separately) |
| `CONFLICT` | The task changed since your plugin read it, or the change could not be completed right now. Read the task again and retry |
| `RATE_LIMITED` | More than 10 changes in a minute |
| `DECLINED` | The user said no when asked |
| `BUSY` | The user is already looking at another question from your plugin. Wait for it to be answered, then ask again |
| `FAILED` | Something unexpected went wrong inside Omniscio. Nothing is promised about whether the change happened; read the task again before you retry |

::: tip Delete asks first
Deleting a task asks the user every time. The text of the question is written by Omniscio from the task's own text, and says how many subtasks go with it, so your plugin cannot word it. The task is deleted only after the user allows it, and Omniscio checks the grant again after the answer. Only one question per plugin can be open at a time. Everything else on this page runs without asking.
:::

## Types

```typescript
interface PluginTaskListView {
  id: string
  name: string
}

interface PluginTaskAccessOutcome {
  /** `true` when the person dismissed the picker without choosing. */
  cancelled: boolean
  /** Every list this plugin may now use, including ones shared earlier. */
  lists: { id: string; name: string }[]
  /** `true` when the person chose "All lists, including new ones". */
  allLists: boolean
}

interface PluginTaskView {
  id: string
  /** `null` for a task that sits on no list. */
  listId: string | null
  text: string
  done: boolean
  dueAt: string | null
  /** `true` when `dueAt` is a calendar day with no time of day. */
  dueIsDateOnly: boolean
  archived: boolean
  /** The task this one is a subtask of, or `null` for a top-level task. */
  parentId: string | null
  createdAt: string
  updatedAt: string
}

interface PluginTasksQuery {
  listId?: string
  done?: boolean
  archived?: boolean
  dueBefore?: string
  limit?: number
  cursor?: string
}

interface PluginTasksPage {
  tasks: PluginTaskView[]
  /** `null` on the last page. */
  nextCursor: string | null
}

interface PluginTaskInput {
  listId: string | null
  text: string
  dueAt?: string
  dueIsDateOnly?: boolean
}

interface PluginTaskPatch {
  text?: string
  dueAt?: string | null
  listId?: string | null
}

interface PluginTaskReorder {
  afterId?: string
  beforeId?: string
}

type PluginWriteCode =
  | 'FEATURE_OFF' | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID'
  | 'CONFLICT' | 'RATE_LIMITED' | 'DECLINED' | 'BUSY' | 'FAILED'

type PluginWriteResult<T> = { ok: true; value: T } | { ok: false; code: PluginWriteCode }
```

## Example

In the webview, ask the user for lists:

```typescript
const omniscio = window.Omniscio ?? window.AgentMC

async function ensureLists(): Promise<PluginTaskListView[]> {
  const shared = await omniscio.tasks.listLists()
  if (shared.length > 0) return shared

  const outcome = await omniscio.tasks.requestAccess()
  if (outcome.cancelled && outcome.lists.length === 0) {
    omniscio.toast.show({ type: 'info', message: 'No task lists shared yet.' })
  }
  return omniscio.tasks.listLists()
}
```

In the backend, add a task and finish the ones that are due:

```typescript
import type { PluginContext } from '@omniscio/plugin-sdk'

export async function tidyUp(ctx: PluginContext, listId: string): Promise<void> {
  const tasks = ctx.tasks!
  const created = await tasks.create({ listId, text: 'Review the weekly report' })
  if (!created.ok) {
    ctx.log.warn(`Could not add the task: ${created.code}`)
    return
  }

  const due = await tasks.list({ listId, done: false, dueBefore: new Date().toISOString() })
  for (const task of due.tasks) {
    const result = await tasks.complete(task.id, true)
    if (!result.ok && result.code === 'RATE_LIMITED') break
  }
}
```

## Notes

- A backend that needs to know which lists were shared can call `ctx.tasks.listLists()` itself.
- `ctx.tasks` is optional on `PluginContext`, so a context double written before the SDK typed it still compiles. Use `ctx.tasks!` or check for it first.
- `@omniscio/plugin-sdk/browser` exports `BridgeTasks`, `PluginTaskListView` and `PluginTaskAccessOutcome`. The backend types (`PluginTasks` and the shapes above) are exported from `@omniscio/plugin-sdk`.
- To work with the user's boards the same way, see [Boards](./boards).
