# Vault

Ask the user which Vault folders your plugin may use, then search, read, add, edit, rename, move and delete the notes in those folders from your plugin's backend.

**Availability:** The webview (`Omniscio.vault`) opens the picker: `requestAccess()`. The backend (`ctx.vault`) searches and reads (`search`, `notes.list`, `notes.get`) and changes notes (`notes.create`, `notes.update`, `notes.rename`, `notes.move`, `notes.delete`). `requestAccess()` is on the webview only.
**Required Permission:** `vault.read` for the picker, `search`, `notes.list` and `notes.get`. `vault.write` for the five changes, and it **requires** `vault.read` in the same manifest.

::: tip Default-deny
Declaring `vault.read` grants nothing by itself. Your plugin sees no note until the user picks a folder, or picks "All your notes, including new ones", in the picker that `requestAccess()` opens. A note outside the picked folders, a note the user hid, and a note that does not exist all answer the same way, so a plugin cannot probe for notes it was not given.
:::

::: tip Available when the person turns it on
The whole Vault API is available when the person has turned on **Plugin access to your Vault** in Labs and the Vault itself is turned on. Until then, reads and `requestAccess()` reject with "This feature is not available." and a change resolves `{ ok: false, code: 'FEATURE_OFF' }`.
:::

## Permissions

`vault.read` and `vault.write` are both elevated permissions. Omniscio describes them to the user as:

- "Vault notes: Read the Vault folders you choose."
- "Change Vault notes: Change notes in the Vault folders you choose. Deleting asks you first."

```json
{
  "permissions": ["vault.read", "vault.write"]
}
```

A manifest that lists `vault.write` without `vault.read` is rejected, so the install card always shows everything the plugin holds.

The user can review each grant, and every change your plugin made, in the same review panel as other plugin grants. They can revoke a grant there. Disabling or uninstalling the plugin revokes them.

## Which notes a plugin gets

The picker lets the user choose individual folders, or all their notes. A grant is one of these:

- **A folder**, for example `Projects/Work`. It covers every note inside that folder, in any subfolder, including notes added later.
- **All your notes, including new ones**, the whole Vault. This is the only grant that reaches notes at the top of the Vault, outside any folder.

Folders match by whole name. A grant on `Work` covers `Work/plan.md` and `Work/2026/plan.md`, and never `Workshop/plan.md`. Matching is case-sensitive.

These are never handed to a plugin, even inside a picked folder and even under an "all" grant. They are left out of every result, and a call that names one resolves `NOT_FOUND`:

- notes the user hid
- the Vault trash, the assets folder, images and files that are not notes
- the app's own folders (the Vault's hidden system folders, plus any folder named `.git`, `assets`, `node_modules` or `.trash`)

Grants belong to the Vault they were picked for. If the user points Omniscio at a different Vault folder, the old grants stay but do nothing until the user picks again.

Paths are relative to the Vault, use `/`, and have no leading or trailing slash. A folder you pass in is cleaned up first (backslashes become `/`, repeated slashes collapse). A folder with `..`, a drive letter, a leading `//`, or a reserved folder name is invalid. The empty string means the top of the Vault.

## Webview methods

### `requestAccess(): Promise<PluginVaultAccessOutcome>`

Open Omniscio's Vault folder picker so the user can choose what your plugin may use. Resolves when the picker closes.

**Returns:** `Promise<PluginVaultAccessOutcome>`. When the user closes the picker without choosing, `cancelled` is `true`; `allNotes` and `folders` still hold anything picked earlier. `folders` lists the picked folders and does not repeat the "all" grant, which shows as `allNotes: true`.

The picker offers up to 500 of the Vault's folders. Omniscio shows one grant picker at a time, so open yours from a button the user pressed, and do not call `requestAccess()` again until it resolves.

## Backend methods

Each backend method is on `ctx.vault`. Reads are limited to 60 a minute per plugin, and changes to 10 a minute per plugin. A read that fails for an unexpected reason rejects with "Something went wrong. Try again."

### `search(query: string, options?: { limit?: number }): Promise<{ hits: PluginVaultSearchHit[] }>`

Search the notes your plugin may read, by their words. `query` is 1 to 500 characters and cannot be only spaces. `limit` is 1 to 50 and defaults to 20; a larger number is refused.

Each hit has the note's `noteId`, `title`, `path` and a `snippet` with the matching words wrapped in `<mark>` tags. This is the plain word search. There is no meaning-based search and no AI summary.

Omniscio runs the search across the whole Vault, then keeps only the hits inside your granted folders. It looks at up to four times `limit` candidates (at most 200), so a plugin that holds a small folder can get **fewer results than it asked for**, even when more matches exist. Narrow the query, or use `notes.list`, when you need them all.

**Returns:** `Promise<{ hits: PluginVaultSearchHit[] }>`. Empty until the user has picked something.

---

### `notes.list(options?: { folder?: string; limit?: number; cursor?: string }): Promise<PluginVaultNotesPage>`

List the notes your plugin may read, without their text, in path order. With no `folder`, it lists every granted folder. With a `folder`, it lists that folder and everything under it; the folder must be inside a grant, otherwise the call rejects with "Folder not found". `limit` is 1 to 100 and defaults to 50.

Pass the previous page's `nextCursor` as `cursor` to get the next page. `nextCursor` is `null` on the last page.

**Returns:** `Promise<PluginVaultNotesPage>`.

---

### `notes.get(id: string): Promise<PluginVaultNote>`

Open one note with its text. A note that does not exist, is hidden, or is outside your grants rejects with "Note not found".

A note larger than 5 MB comes back with `body: null` and `bodyTooLarge: true`. Keep `updatedAt` from this call: you need it to edit the note.

**Returns:** `Promise<PluginVaultNote>`.

---

### `notes.create(input: { folder: string; name: string; body: string }): Promise<PluginWriteResult<{ id: string; path: string; updatedAt: string }>>`

Add a note. `folder` must be inside a grant (the empty string only with the "all" grant) and may name a subfolder that does not exist yet. `name` is trimmed, cannot contain `/` or `\`, is at most 200 characters, and gets `.md` added when it is missing. `body` is at most 5 MB.

A note already at that path (even a hidden one) resolves `CONFLICT`. A bad `folder` or `name` resolves `INVALID`. A folder outside your grants resolves `NOT_FOUND`.

**Never asks.**

---

### `notes.update(id: string, patch: { body: string; expectedUpdatedAt: string }): Promise<PluginWriteResult<{ id: string; updatedAt: string }>>`

Replace a note's whole text. `expectedUpdatedAt` is **required**: pass the `updatedAt` you got from `notes.get`. Without it the change resolves `INVALID`.

If the note changed after that time, the change resolves `CONFLICT` and nothing is written. Read the note again, merge, and retry with the new `updatedAt`. Keep the `updatedAt` from this call's result for your next edit.

**Never asks.** The note's earlier text stays in its version history.

---

### `notes.rename(id: string, name: string): Promise<PluginWriteResult<{ id: string; path: string; updatedAt: string }>>`

Rename a note in the same folder. `name` follows the same rules as in `notes.create`. A name already taken resolves `CONFLICT`; a bad name resolves `INVALID`. Links to the note in the user's other notes are updated by Omniscio, as when the user renames it. Your plugin is shown nothing from those other notes.

**Never asks.**

---

### `notes.move(id: string, folder: string): Promise<PluginWriteResult<{ id: string; path: string; updatedAt: string }>>`

Move a note into another folder, keeping its file name. Both the folder it leaves and the folder it enters must be inside your grants, otherwise the change resolves `NOT_FOUND`. The destination may be a subfolder of a granted folder that does not exist yet. A destination that is reserved or escapes the Vault resolves `INVALID`.

**Never asks.**

---

### `notes.delete(id: string): Promise<PluginWriteResult<{ id: string }>>`

Delete a note. The note moves to the Vault trash, where the user can restore it.

**Asks the user first, every time.** There is no setting to turn this off.

## Asking first

Deleting a note shows the user a question written by Omniscio from its own records: your plugin's name, the note's path and that it moves to the Vault trash. Your plugin cannot word it. The note moves only after the user allows it, and Omniscio checks the grant again after the answer. Saying no, closing the dialog or not answering resolves `DECLINED` and changes nothing. Only one question per plugin can be open at a time.

Adding, editing, renaming and moving never ask.

## Results and refusals

A change never throws because it was refused. It resolves `{ ok: false, code }`, so check `ok` before you use `value`. A read that is refused rejects with a plain message instead: "This feature is not available.", "Note not found", "Folder not found" or "Too many requests. Try again in a minute."

| `code` | What it means |
|---|---|
| `FEATURE_OFF` | The user has not turned on Plugin access to your Vault, or the Vault is off |
| `NOT_FOUND` | The note does not exist, is hidden, or is outside your grants; or a folder you named is outside your grants. These all look the same on purpose |
| `FORBIDDEN` | The user themselves may not make this change |
| `INVALID` | The change does not fit: a bad folder or name, a missing `expectedUpdatedAt`, or a destination that is reserved |
| `CONFLICT` | A note already has that path, or the note changed since `expectedUpdatedAt`. Read the note again before you retry |
| `RATE_LIMITED` | More than 10 changes in a minute |
| `DECLINED` | The user said no when asked to delete |
| `BUSY` | The user is already looking at another question from your plugin. Wait for it to be answered, then ask again |
| `FAILED` | Something unexpected went wrong inside Omniscio. Nothing is promised about whether the change happened; read the note again before you retry |

## Types

```typescript
interface PluginVaultAccessOutcome {
  /** `true` when the person dismissed the picker without choosing. */
  cancelled: boolean
  /** `true` when the plugin may use every note, including new ones. */
  allNotes: boolean
  /** Every picked folder, including ones picked earlier. */
  folders: string[]
}

interface PluginVaultSearchHit {
  noteId: string
  title: string
  path: string
  /** Matching words are wrapped in <mark> tags. */
  snippet: string
}

interface PluginVaultNoteSummary {
  id: string
  title: string
  path: string
  /** An ISO 8601 date-time. */
  updatedAt: string
}

interface PluginVaultNotesPage {
  notes: PluginVaultNoteSummary[]
  /** `null` on the last page. */
  nextCursor: string | null
}

interface PluginVaultNote {
  id: string
  title: string
  path: string
  /** `null` when the note is larger than 5 MB. */
  body: string | null
  bodyTooLarge: boolean
  createdAt: string
  updatedAt: string
}

type PluginWriteCode =
  | 'FEATURE_OFF' | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID'
  | 'CONFLICT' | 'RATE_LIMITED' | 'DECLINED' | 'BUSY' | 'FAILED'

type PluginWriteResult<T> = { ok: true; value: T } | { ok: false; code: PluginWriteCode }
```

## Example

In the webview, ask the user what your plugin may use:

```typescript
const omniscio = window.Omniscio ?? window.AgentMC

async function pickFolders(): Promise<void> {
  const outcome = await omniscio.vault.requestAccess()
  if (outcome.cancelled && !outcome.allNotes && outcome.folders.length === 0) {
    omniscio.toast.show({ type: 'info', message: 'No Vault folders picked yet.' })
  }
}
```

In the backend, append a line to a note, and retry once if the user edited it in the meantime:

```typescript
import type { PluginContext } from '@omniscio/plugin-sdk'

export async function appendLine(ctx: PluginContext, noteId: string, line: string): Promise<void> {
  const notes = ctx.vault!.notes
  for (let attempt = 0; attempt < 2; attempt++) {
    const note = await notes.get(noteId)
    if (note.body === null) return
    const result = await notes.update(noteId, {
      body: `${note.body}\n${line}`,
      expectedUpdatedAt: note.updatedAt
    })
    if (result.ok) return
    if (result.code !== 'CONFLICT') {
      ctx.log.warn(`Could not update ${note.path}: ${result.code}`)
      return
    }
  }
}
```

## Notes

- `ctx.vault` is optional on `PluginContext`, so a context double written before the SDK typed it still compiles. Use `ctx.vault!` or check for it first.
- `@omniscio/plugin-sdk/browser` exports `BridgeVault` and `PluginVaultAccessOutcome`. The backend types (`PluginVault`, `PluginVaultNotes` and the note types) are exported from `@omniscio/plugin-sdk`.
- A note's text is only ever returned to your backend. The webview can open the picker and see the folder names that were shared, never a note.
- To work with the user's task lists, see [Tasks](./tasks). To message or pause their sessions, see [Session Control](./session-control).
