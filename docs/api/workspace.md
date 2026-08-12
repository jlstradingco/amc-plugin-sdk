# Workspace

Read, write, and run commands against the user's **real project checkouts and worktrees** --
not your plugin's sandboxed data directory.

**Availability:** Backend only (`ctx.workspace`)
**Required Permission:** `workspace.read`, `workspace.write`, `workspace.exec`

::: warning The mocks deliberately refuse this namespace
`ctx.workspace` **is implemented by the host** and these 14 methods are real. (An earlier
version of this page said the opposite for six days after the host shipped it -- if you built
a workaround on that claim, you can delete it.)

What is still true is that **the SDK's mocks will not fake it.** `createTestContext()` and the
dev shell both reject on every `ctx.workspace.*` call, on purpose. The capability is gated by
machinery no in-memory double can reproduce -- a per-project runtime grant the user can revoke,
a native confirm on `deleteFile` and on almost every `run`, and single-flight limits -- so a
green test against a fake would predict nothing. This SDK has been burned by exactly that
before, when `ctx.events` was mocked as a live event emitter while the production path was dead
in both directions.

Inject your own double for the methods your test needs, and verify against a real AMC build.
:::

::: danger There is no manifest surface
Do **not** declare a `workspace` block with `commandSlots` or `binding` in your manifest. The
host has no such field, and zod strips unknown keys, so the whole block is silently discarded
at parse time. `run` takes its command and args from the plugin at call time instead.
:::

## Why it is not `ctx.fs`

[`ctx.fs`](./fs) is hard-sandboxed to `<userData>/plugins/<id>/data` -- relative paths, text
only, five methods. It cannot see a user's project at all.

`ctx.workspace` is the opposite: it reaches into real checkouts, so every call is gated twice.
An **install-time permission** grants the capability; a **per-project runtime grant** the user
makes (and can revoke) grants the resource. Worktrees inherit their project's grant.

## The handle model

Three types carry every path in this API, and the shape is what makes escapes unrepresentable.

```typescript
type WorktreeRef = string | null            // absolute worktree ROOT path; null = main checkout

interface WorkspaceScope  { projectId: string; worktree: WorktreeRef }
interface WorkspaceHandle extends WorkspaceScope { path: string }   // path is RELATIVE
```

`path` is deliberately relative: the host joins it onto the scope's root and re-checks the
result, so a forged absolute or `..`-escaping path cannot reach outside the grant.
`resolve()` is the only door an absolute path enters by.

## Three things that will bite you

**Every refusal looks identical.** The host collapses almost all negative answers into one
string, `That file is not available to this plugin.` A revoked grant, a path outside the
scope, and a genuinely missing file are deliberately indistinguishable. Do not branch on the
message.

**Five methods are single-flight.** `glob`, `listWorktrees`, `readFiles`, `writeFiles` and
`run` reject a second concurrent call for the same plugin, method and project with
`workspace.<m> is already running for this plugin.` So `Promise.all([ws.glob(s, a), ws.glob(s, b)])`
fails. Sequence them.

**`writeFiles` is not atomic.** It reports success per entry; one failure neither rolls back
nor stops the rest. Check every element.

## Permissions

```json
{
  "permissions": ["workspace.read", "workspace.write", "workspace.exec"]
}
```

The three are **not hierarchical and none implies another.** A manifest asking for
`workspace.write` or `workspace.exec` without an explicit `workspace.read` alongside it is
**rejected** -- by the host loader, by the marketplace publish gate, and by `amc-plugin
validate`. The host refuses to infer it on purpose: around twenty consumers read the raw
permissions array and the consent ledger, so an inferred permission would make the consent
card the user reads disagree with what the plugin actually holds.

## `workspace.read`

```typescript
listProjects(): Promise<WorkspaceProjectRef[]>          // GRANTED projects only
listWorktrees(projectId): Promise<WorktreeInfo[]>       // live, not cached
requestAccess(): Promise<WorkspaceProjectRef[]>         // see below
resolve(absolutePath): Promise<WorkspaceHandle | null>

glob(scope, patterns, opts?): Promise<WorkspaceEntry[]>
stat(handle): Promise<WorkspaceEntry | null>            // size is 0 for a directory
exists(handle): Promise<boolean>                        // never throws
readFile(handle, { encoding? }?): Promise<string>
readFiles(handles): Promise<Array<{ handle } & ({ content } | { error })>>
```

All four discovery methods need `workspace.read` specifically -- holding only `workspace.write`
is not enough to construct your first handle.

**`requestAccess()` returns only the project the user just granted** (a one-element array), or
`[]` if they cancelled. It is not a read of everything you can reach; call `listProjects()`
for that.

**`glob` needs at least one pattern.** At most 32, each up to 256 characters; `exclude` is
capped at 32 entries and *adds* to the host's defaults rather than replacing them. Results are
silently truncated at the walker's cap, and nothing in the return tells you so.

**`readFiles` does not chunk.** Hard limits: 256 handles per call (over that it is rejected
outright), 32 MiB total, and 8 MiB per file -- an oversized file comes back as an `{ error }`
entry rather than failing the batch. Split larger batches yourself. `readFile` has its own,
larger 64 MiB single-file cap.

## `workspace.write`

```typescript
writeFile(handle, content): Promise<void>               // 2 args; up to 8 MiB
writeFiles(batch): Promise<WorkspaceWriteFilesResult[]> // up to 64 entries, 16 MiB total
mkdir(handle): Promise<void>                            // ONE level; parent must exist
deleteFile(handle): Promise<void>                       // gated on write, not a delete perm
```

**There is no compare-and-swap.** The host has no `expectedMtimeMs` concept, so `writeFile` is
a last-writer-wins overwrite. If you need to avoid clobbering a concurrent edit, `stat()` first
and accept the race -- the SDK cannot close it for you.

**`deleteFile` may prompt.** For a file your plugin did not create, the host raises a native
confirm you cannot bypass; files you created delete silently.

## `workspace.exec`

```typescript
run(request: {
  scope: WorkspaceScope
  command: string          // bare NAME, e.g. 'git' -- not a shell line
  args: string[]           // up to 64, each <= 1024 chars
  timeoutMs?: number       // clamped to 5s..120s; default 30s
}): Promise<{
  exitCode: number | null  // null on timeout or spawn failure
  stdout: string           // capped at 1 MiB
  stderr: string           // capped at 1 MiB; '\n[timed out]' appended on timeout
  silent: boolean          // true only if it ran without a confirm dialog
  timedOut: boolean
}>
```

**Blocking and single-shot.** One promise, resolved when the command finishes. There is no job
id, no polling, no streamed output, and no cancel.

**It does not reject on failure.** A non-zero exit, a spawn failure and a timeout all *resolve*
with the object above. Branch on `exitCode` and `timedOut`, not `catch`.

**Almost every call prompts the user.** The host runs silently only for an exact allow-list
match -- today `git status --porcelain` and `git status --short` -- and otherwise shows the
command, args and cwd in a native confirm. **If no confirm can be shown the call is refused**,
so this can never run unattended.

You supply `command` and `args` directly. Injection is closed by `shell: false`, a PATH
filtered to exclude the project and any `node_modules/.bin`, and that confirm -- not by
manifest-declared command slots.

## Encoding

UTF-8 text throughout. `readFile` takes an `encoding` option for forward compatibility; the
host accepts `'utf-8'` and `'utf8'`, and `'utf-8'` is the spelling to prefer.

## Permission map

| Permission | Methods |
|---|---|
| `workspace.read` | `listProjects`, `listWorktrees`, `requestAccess`, `resolve`, `glob`, `stat`, `exists`, `readFile`, `readFiles` |
| `workspace.write` | `writeFile`, `writeFiles`, `mkdir`, `deleteFile` |
| `workspace.exec` | `run` |
