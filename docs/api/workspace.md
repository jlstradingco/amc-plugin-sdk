# Workspace

Read, write, and run commands against the user's **real project checkouts and worktrees** --
not your plugin's sandboxed data directory.

**Availability:** Backend only (`ctx.workspace`)
**Required Permission:** `workspace.read`, `workspace.write`, `workspace.exec`

::: warning The mocks deliberately refuse this namespace
`ctx.workspace` **is implemented by the host** and these 18 methods are real. (An earlier
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
fails. Sequence them. The four **exec-job** methods are exempt -- a job you could not poll
while it ran would be useless.

**`writeFiles` is not atomic.** It reports success per entry; one failure neither rolls back
nor stops the rest. Check every element.

**`run` and `exec` are not interchangeable, and their names do not say so.** `run` is one-shot
and bounded (30s default, 120s ceiling). `exec` starts a job that can run for hours and is
polled. See [The two exec paths](#the-two-exec-paths).

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
writeFile(handle, content, expectedMtimeMs, { encoding? }?): Promise<void>   // up to 8 MiB
writeFiles(batch, { encoding? }?): Promise<WorkspaceWriteFilesResult[]>      // 64 entries, 16 MiB
mkdir(handle): Promise<void>                                 // ONE level; parent must exist
deleteFile(handle, expectedMtimeMs, { encoding? }?): Promise<void>  // gated on write, not delete
```

### The compare-and-swap token is required

Every mutation carries the file's **last-known modification time**. It is a positional
argument, not an option, and it is not skippable:

```typescript
const entry = await ws.stat(handle)          // entry.mtimeMs is the token
await ws.writeFile(handle, next, entry?.mtimeMs ?? null)
```

- **`null` means "this file must NOT exist"** -- it is an assertion, not a bypass. Use it to
  create a file you expect to be new.
- **`deleteFile`'s token is not nullable.** "Must not exist" is meaningless for a delete, so
  that one method takes a plain `number`.
- **Do not round it.** `mtimeMs` is a float on some filesystems and truncating it will fail
  the check against a file nobody touched.
- Every entry of a `writeFiles` batch carries its own token; there is no batch-wide opt-out.

On a mismatch the host refuses with **`That file changed since you last read it. Read it
again, then retry.`** -- one of the few refusals *not* collapsed into the generic string,
because unlike the others it is actionable.

::: tip This changed
An earlier version of this page said "there is no compare-and-swap ... last-writer-wins".
That was true of the host as it stood on 2026-08-11 and stopped being true when the write
slice landed. If you wrote a `stat()`-then-hope wrapper against the old advice, the token now
does that job properly.
:::

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

**Blocking and single-shot.** One promise, resolved when the command finishes. No job id, no
polling, no streamed output, no cancel -- for any of that, use `exec` below.

**It does not reject on failure.** A non-zero exit, a spawn failure and a timeout all *resolve*
with the object above. Branch on `exitCode` and `timedOut`, not `catch`.

**Almost every call prompts the user.** The host runs silently only for an exact allow-list
match -- today `git status --porcelain` and `git status --short` -- and otherwise shows the
command, args and cwd in a native confirm. **If no confirm can be shown the call is refused**,
so this can never run unattended.

You supply `command` and `args` directly. Injection is closed by `shell: false`, a PATH
filtered to exclude the project and any `node_modules/.bin`, and that confirm -- not by
manifest-declared command slots.

### The two exec paths

`run` and `exec` share a permission and nothing else. Pick by how long the command lives:

| | `run` | `exec` |
|---|---|---|
| Shape | one promise, resolves at exit | returns a `jobId`, you poll |
| Lifetime | 30s default, **120s ceiling** | hours -- reaped on **silence**, not age |
| `timeoutMs` | accepted, clamped to 5s..120s | **no such field** -- see below |
| Confirm dialog | skipped for `git status --porcelain` / `--short` | **always**, no exceptions |
| PATH | project-local bins **stripped** | `node_modules/.bin` chain **prepended** |
| Single-flight | yes | no |

The PATH row is the one that surprises people: the two point in **opposite directions**, on
purpose. `run` refuses to let a repo shadow a system binary; `exec` exists to run the repo's
own test runner, so it must find it.

::: warning `timeoutMs` on a job is silently dropped
`exec`'s request has no `timeoutMs`, and the host's schema *strips* one rather than rejecting
it -- so sending it looks like it worked. A job's lifetime is governed by an idle watchdog:
**it dies from silence, never from age.** The SDK type omits the field so this is a compile
error instead of a runtime surprise.
:::

### Starting and polling a job

```typescript
exec(request: {
  scope: WorkspaceScope
  command: string          // same rules as run(): a bare NAME
  args: string[]
}): Promise<{ started: boolean; jobId: string }>

execStatus(jobId): Promise<WorkspaceExecJobStatus>
execResults(jobId, poll?): Promise<WorkspaceExecPollResponse>
execCancel(jobId): Promise<WorkspaceExecJobStatus>
```

**`started: false` is not an error.** It means you already have a live job for that command;
`jobId` identifies the existing one. No second dialog is raised. Poll the id you got back.

**`execResults` is a cursor read, not a whole-artifact fetch.** There is no `execArtifact`.
Carry the cursors forward:

```typescript
let results = 0, console_ = 0
for (;;) {
  const r = await ws.execResults(jobId, { resultsCursor: results, consoleCursor: console_ })
  results = r.resultsCursor
  console_ = r.consoleCursor
  for (const line of r.records) handle(JSON.parse(line))   // always WHOLE JSONL lines
  if (r.state !== 'starting' && r.state !== 'running') break
  await sleep(500)
}
```

`records` never contains a partial line, so `JSON.parse` on each entry is safe. `maxBytes` is
a courtesy ceiling -- the host re-clamps per stream regardless (512 KiB results, 256 KiB
console), so asking for more does not get you more.

**State is one of seven:**

| State | Meaning |
|---|---|
| `starting` / `running` | in flight -- keep polling |
| `stopping` | a cancel is in progress; the child has not exited yet |
| `exited` | the command finished on its own. Read `exitCode` |
| `cancelled` | you called `execCancel` and the child is gone |
| `idle-timeout` | the watchdog reaped it. Covers going quiet part-way **and** never producing a first byte -- every watchdog reason lands here |
| `failed` | it never ran. Most often the user **declined the confirm dialog** |

The last four are terminal. `failed` is easy to miss and you can hit it without having raised
the dialog yourself: because the job methods are not single-flight, a second `exec` for the
same command resolves `{ started: false }` with the *first* call's `jobId`, so a decline on
that dialog surfaces on the id you are holding. Handle it, or an exhaustive `switch` will fall
through at runtime.

**Cancelling is a request, not an instant.** `execCancel` resolves with `cancelling: true`
while the child may still be alive; keep polling `execStatus` to see it actually end.

**Truncation has two signals, and they mean different things.** `consoleTruncated` says the
host's disk cap dropped bytes from the **middle** of the stream (it keeps head and tail), so
what you read is not contiguous. `consoleSkippedBytes` says how many bytes *this particular
read* jumped because your cursor pointed into that discarded middle.

::: tip This changed
This whole section is new. The page previously said `run` was the only exec method and that
there was "no job id, no polling ... and no cancel". That was accurate on 2026-08-11 and the
host shipped the job runner afterwards.
:::

## Encoding

UTF-8 text throughout. `readFile`, `writeFile`, `writeFiles` and `deleteFile` each take an
`encoding` option for forward compatibility; the host accepts `'utf-8'` and `'utf8'`, and
`'utf-8'` is the spelling to prefer.

The option is **reserved, not functional** -- v1 is text only, and it exists so binary support
can be added without breaking these signatures. `deleteFile` accepts it and ignores it (a
delete has no bytes); it is there so the option is reserved on both write signatures rather
than one. Passing anything else, `'base64'` included, is refused rather than silently mangled.

## Permission map

| Permission | Methods |
|---|---|
| `workspace.read` | `listProjects`, `listWorktrees`, `requestAccess`, `resolve`, `glob`, `stat`, `exists`, `readFile`, `readFiles` |
| `workspace.write` | `writeFile`, `writeFiles`, `mkdir`, `deleteFile` |
| `workspace.exec` | `run`, `exec`, `execStatus`, `execResults`, `execCancel` |
