# Changelog

All notable changes to the AMC Plugin SDK are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions listed here cover the published packages `@agent-mc/plugin-sdk`,
`@agent-mc/plugin-cli`, and `@agent-mc/plugin-dev-shell`, which are released
together.

## [Unreleased]

### Fixed — host parity reconciliation (2026-08-11)

Verified the whole SDK surface against host `origin/master@8722cc3fca`. The
suite was green throughout: every parity assertion compares the SDK against a
vendored mirror, so a stale mirror and a stale enum agreed with each other.

**Breaking — `ctx.workspace` was six methods of fiction.** The SDK declared 17
methods transcribed from a spec the host never implemented. The host ships 14.
Removed `listBindings`, `requestBinding`, `exec`, `execStatus`, `execResults`
and `execCancel` (and the `WorkspaceExecStatus`, `WorkspaceExecResults`,
`WorkspaceBinding`, `WorkspaceBindingResult` types); added `writeFiles`,
`mkdir` and `run`. `writeFile` takes 2 arguments and returns `void`;
`deleteFile` takes 1 — the `expectedMtimeMs` compare-and-swap token never
existed. There is no job model: `run` is blocking and single-shot.

**Breaking — `ctx.recording` could not work as typed.** `start()` takes no
arguments and resolves `{ ok, recordingId } | { ok, error }`, not a handle;
`stop()` takes a bare id string, so passing the old `RecordingHandle` was a
silent no-op. Removed `getShareUrl()` and `delete()` (deliberate
non-capabilities, not missing wiring) and `RecordingHandle`; added `get()`.
`Recording` loses the host-redacted `filename`/`createdAt`/`sizeBytes` and
gains `status`, `sourceType`, `sourceLabel`, `startedAt`, `endedAt`.

**`amc-plugin validate` rejected manifests the host accepts.** Six of the
host's own twelve builtins failed validation. `settings`, `storage`,
`migrations` and `sdkVersion` are no longer required (the host defaults or
omits all four); `cli.endpoints` accepts `PATCH` and no longer requires
`description` or `auth`; `backend.resourceLimits.memoryMb` loses its invented
512 ceiling.

**`amc-plugin validate` passed manifests the host rejects.** Added SQL
identifier validation at all six sites the host enforces it (it is the
injection boundary — the host wraps these names in double quotes without
escaping); made reserved-column matching case-insensitive, so `ID` no longer
reaches a `duplicate column name` crash; added the rule that
`workspace.write`/`workspace.exec` require an explicit `workspace.read`, which
both the host loader and the marketplace publish gate enforce.

**Added.** `cli.endpoints[].requiresConfirmation` — the flag that forces a
human inbox approval before a destructive AI-callable endpoint runs, which had
no SDK type at all. `'dev'` on `PluginSource`.

**Documented as inert.** The `cron` and `workspace` manifest blocks are read by
nothing host-side and are stripped at parse time. Cron is a runtime capability
via `ctx.cron.register`.

**Breaking — three namespaces were on the wrong surface.** `ctx.tts`,
`ctx.sessionHistory` and `ctx.firebase` are webview-only; the host builds no
backend entry for them, so calling one was a `TypeError` at activation rather
than a permission error. They now live on `AgentMC`. Conversely
`AgentMC.recording` never existed at all and is removed — recording stays on
`ctx`, where it is real.

**Breaking — `AgentMC.auth` had six methods; the host has one.** The backend's
`PluginAuth` had been assigned to the webview namespace. Replaced with
`BridgeAuth.getWebAuth()`.

**Breaking — `export.savePDF` is `savePdf`,** takes `html` rather than
`markdown`, and has no `metadata`. The whole namespace also stopped erasing its
return types: `saveFile`/`savePdf` report whether the user cancelled,
`pickFolder` resolves an object rather than a bare path string, and
`verifyFiles` exists for a result that was being thrown away as `void`. Added
`getDefaultFolder`.

**Breaking — `theme.get()` returns a Promise** (it was typed synchronous, so
`theme.get().mode` type-checked and was `undefined`), and its `visualTheme`
field never existed. The real payload is `{ mode, accent, surfaces }`, and it is
a static placeholder host-side.

**Breaking — `InboxItem.timestamp` and `SidebarItem.status` are required.** This
is the quietest failure of the set: the host validates each push against a
schema and, on any failure, logs a warning and drops the WHOLE batch without
throwing. `InboxItem`'s invented `body`/`icon`/`priority`/`actionLabel`/
`actionId` (replaced by the real `subtitle`/`dotColor`) therefore made
`setItems` resolve successfully while nothing reached the inbox. `PluginToast`
gains `'warning'` and `durationMs` and no longer requires `body`. Added
`inbox.postAlert`.

**Added `session.create({ clientRequestId })`** — the durable idempotency key
that prevents a retry minting a second *paid* session. A parity test had been
pinning its absence.

**Fixed three examples** that could never have run: `recording-demo` (drove a
non-existent `AgentMC.recording`, now backend-owned and driven over the event
bus), `auth-demo` (six webview methods that do not exist), and `inbox-demo`
(item fields that made every publish a silent no-op).

**Breaking — four silent runtime bugs.** Each of these compiled and did the
wrong thing:

- `ctx.cron.isRegistered` was typed `boolean` while returning a Promise, so
  `if (ctx.cron.isRegistered(id))` was **always true** — a Promise is never
  falsy. `register`/`unregister` are async too, and `register` *rejects* on an
  invalid cron expression, which nothing awaited.
- `ctx.events.on` returns **nothing** on the backend; it was typed
  `() => void`, so `off()` threw `TypeError: off is not a function`. There is
  no unsubscribe path on that surface at all. Both mocks had been handing back
  a working unsubscribe and two canary tests asserted it — the same
  `ctx.events` failure this repo cites as its cautionary tale, recurring inside
  the guard meant to prevent it. `BridgeEvents` narrows the member, since the
  webview genuinely does return one.
- `SpendWindow` was missing `codingOutOfPocket`. A window's real money is
  `outOfPocket + codingOutOfPocket`, so reporting the first alone
  **under-reported spend**. `SpendEngineLine` gains `outOfPocket`.
- `sidebar.setBadge` accepts `number | string | null`; `null` clears the badge
  and was previously unspellable.

**Documented, not changed:** `ctx.dataDir` is AMC's userData root, not your
plugin's directory, and not the root `ctx.fs` is scoped to — so
`ctx.fs.readFile(path.join(ctx.dataDir, x))` throws.

**`documents` corrections.** The namespace is behind the host's
`plugin-documents-io` unreleased-feature flag, so on a stock build every call
rejects with `This capability is not available.` — nothing said so. The
capability token in the `@doc` URL is already shipped (that URL is a secret
today, not eventually), and `stat()` already re-pins a replaced document.
Host line-number citations throughout `bridge.ts` were replaced with symbol
names; four were already pointing at unrelated code.

### Fixed — scaffold SDK floor (2026-08-11)

- `amc-plugin create` scaffolded new plugins with `sdkVersion: "^1.0.0"` and a
  `@agent-mc/plugin-sdk: "^1.0.0"` devDependency. That range was deliberately
  wide while 1.x was current, but `^1.0.0` means `>=1.0.0 <2.0.0` — so from the
  moment 2.0.0 was published it *excluded* the current major. Every plugin
  scaffolded by the 2.0.0 CLI resolved to SDK 1.0.7 and immediately hit the
  1.0.7-era gaps this release exists to fix: the permission enum rejects `tts`,
  `sessions.readHistory`, `firebase` and `spend`, and a non-strict manifest
  parse silently strips `ui.hideProjectPanel`. The scaffold floor is now
  `^2.0.0`, and the docs that document it were moved in step.

  Note this ships inside `@agent-mc/plugin-cli`, so it does not reach anyone
  until a release is cut. `create` in the published 2.0.0 CLI still scaffolds
  `^1.0.0`.

## [2.0.0] - 2026-08-10

**Read this first if you are upgrading from npm: you are on 1.0.7.** Versions
1.1.0, 1.2.0 and 1.3.0 were each stamped and changelogged in this file but never
published, so the registry's `latest` goes straight from 1.0.7 to 2.0.0. The
1.1.0, 1.2.0 and 1.3.0 sections below are part of *this* upgrade — everything in
them reaches npm for the first time here, including 1.2.0's four new permissions
(`tts`, `sessions.readHistory`, `firebase`, `spend`) and the whole
`amc-automation` binary added in 1.3.0.

**Why this is a major rather than the 1.3.0 the version files carried.** Semver
here is measured against what is on npm, not against the last number committed.
The breaking items below make a previously-compiling plugin stop compiling, and
1.3.0 sits inside `^1.0.7` — so publishing under that number would have upgraded
every consumer into these changes automatically, with no action on their part.
2.0.0 is the number that lets `^1.x` consumers stay where they are.

### Changed — BREAKING

These correct types that described behaviour AMC does not have. Each was a silent wrong answer
before, so the break is the point: code that stops compiling was already not doing what it looked
like it was doing.

- **`ctx.sessions.create()` no longer accepts `projectId`.** AMC has always derived the project
  from the plugin's own virtual project (`__plugin_<id>__`) and never read a caller-supplied one,
  so passing it appeared to target a project and silently did not. *Migration:* delete the option.
  If you need to launch into one of the user's real projects, use
  `AgentMC.session.launchWithDraft({ projectId, draftText })` from a webview.
- **`AgentMC.session.getStatus()` is typed `Promise<{ status, pendingAction }>`**, not
  `Promise<string>` — which is what AMC has always returned. *Migration:* read `.status`. Any
  `const s = await getStatus(id); if (s === 'ended')` was comparing an object to a string and was
  always false; that bug is now a compile error. Our own `sessions-demo` had it, and consequently
  polled forever.
- **`PluginMigrationOperation.type` is now `add_column | add_index | drop_index`.**
  `remove_column` and `remove_index` were SDK-only fictions AMC has never accepted; `drop_index`
  was missing. `column` is now required on every operation (AMC has no `.optional()` on it) and the
  `index` field is gone — an index operation identifies its index by a single column.
- **`amc-plugin validate` now refuses `id`, `created_at` and `updated_at`** as column names, in
  both a collection schema and a migration operation. AMC manages those three itself and rejects
  them at install, so a manifest declaring one passed validation here and then failed to install.

### Added

- **The `workspace.*` permissions and `ctx.workspace` — typed ahead of AMC, and
  deliberately marked as such.** Read, write, and run user-bound test or build
  commands against real project checkouts and worktrees. **AMC does not implement
  this yet** — there is no host `workspace` namespace on any build, so every call
  rejects at runtime. It is typed here so a plugin can be authored and packaged
  against it; `amc-plugin preflight` passing validates shape, not host support.
  Both SDK mocks reject on every `ctx.workspace.*` method rather than faking one,
  so a plugin's unit tests cannot go green against a capability that cannot run.
  See [the Workspace API docs](docs/api/workspace.md).
- **The host's tool-content markers** (`TOOL_CALL_MARKER`, `TOOL_RESULT_MARKER`
  and their regexes) plus a fence-aware `stripToolLines`, so plugins parsing
  session transcripts stop hardcoding `▸` and `←`.
- **`ui.hideProjectPanel`, `ui.sessions`, `ui.overlay` and `storage.uniqueIndexes` now survive
  validation.** All four are real in AMC — `uniqueIndexes` materialises real unique indexes and is
  what makes `collectionUpsert` atomic — but a non-strict parse stripped them from this SDK's
  output, so a packaged plugin could not rely on them.
- **`HistorySession.status` is typed `SessionStatus`** rather than a bare `string`.
- **`SessionStatus`, `SessionPendingAction`, `SessionMessage` and `PluginSuggestedPrompt`** are
  exported. The status unions are deliberately open (`| (string & {})`): they keep autocomplete for
  the known values without going stale — and silently misrouting an exhaustive `switch` — the day
  AMC adds one.
- **`BridgeSessionMessage` and `BridgeSessionStatus`** describe the webview surface, whose message
  body is named `content` where the backend names it `text`. Naming the two shapes separately makes
  mixing them a compile error instead of the `m.text ?? m.content ?? ''` hedge plugins have been
  writing.
- **`BridgeSession.launchWithDraft` accepts `autoSend`**, which AMC reads.
- **`createMockSessionMessage` is exported from `@agent-mc/plugin-sdk/testing`.** The SDK's test
  harness and the dev shell's mock now share one definition of the backend message row instead of
  keeping a copy each. The point is not the lines saved: that surface names the body `text` while
  both webview surfaces name it `content`, so a mock drifting from the host teaches plugin authors
  the wrong field. A plugin author hand-rolling a session mock can use it rather than inventing a
  fourth shape.
- **`AgentMC.documents` and `DocumentHandle`** type the host's file-picker namespace — `open`,
  `list`, `stat`, `append` and `close` — mirrored from AMC `origin/master` `dc0adf22dc` and pinned
  by a compile-time canary, so host drift breaks this build instead of a plugin at runtime.
  Webview-only and permission-free by design: the picker is the consent, and `documents` is
  deliberately absent from `PluginContext` because AMC's backend `ctx` has no such namespace.
  Two shapes mislead on sight and are documented rather than smoothed over — `size` is live when
  the Handle is serialized, so a copy you hold still goes stale (`stat()` before every `append()`),
  and `url` is opaque and must never be parsed, logged, or persisted, since an in-flight host
  change makes it carry a capability token. **No mock ships with it:** both SDK mocks implement
  `PluginContext`, so neither can host a webview namespace without typing a capability a backend
  cannot call — stub it yourself rather than let a fake go green over a dead path. See
  [the Bridge-Only APIs docs](docs/api/index.md#documents).

### Fixed

- **`amc-plugin dev` now launches.** The documented "test a plugin locally" command could not start
  on Windows at all, and the dev shell rendered on no platform — so in practice it had never worked
  for an external developer anywhere. Four defects, fixed together (#47, fixes #46):
  - The CLI resolved Electron and then spawned `electron/cli.js` directly. A `.js` file is not
    executable on Windows, so `spawn()` threw `EFTYPE`; the fallback then tried `npx`, which is
    equally broken there without `shell: true`. It now spawns the platform binary that
    `require('electron')` returns, and reports an actionable error instead of falling back.
  - `packages/dev-shell` is ESM, but `shell-window.ts` used `__dirname`, which is undefined under
    ESM — so `loadFile()` threw before the shell chrome could render, on every OS. It is now derived
    from `import.meta.url`.
  - Electron moved from a `devDependency` of `@agent-mc/plugin-dev-shell` to a `dependency`, and
    the dev shell is now a dependency of `@agent-mc/plugin-cli`. Previously neither installing the
    shell nor installing the CLI brought Electron, and a globally installed CLI cannot see a plugin's
    own `node_modules`, so its advice to install the shell locally pointed somewhere it could never
    look. **Note the tradeoff:** `amc-plugin` now pulls Electron on install, including for
    build-only uses such as `validate`, `package` and `publish`.
  - A fresh clone installed a non-functional Electron, because pnpm 10 blocks dependency build
    scripts by default and Electron's postinstall is what downloads the binary. `pnpm-workspace.yaml`
    now allow-lists it. This governs *this repo's* install only — a consumer on pnpm 10 needs the
    same `onlyBuiltDependencies: [electron]` in their own workspace, or `amc-plugin dev` will report
    Electron as missing.
- **The dev shell's mock session status was frozen.** `getStatus` hardcoded `'running'` and
  `stop()` never changed it, so a plugin polling until its session ended looped forever against
  the dev shell while working correctly against AMC.
- **Two dev-shell sessions created in the same millisecond shared one ID.** The mock built its ID
  from `Date.now()`, so a plugin spawning sessions in a loop saw them silently merge — one status
  and one message history across what should have been separate sessions. It now uses a counter.
- **`ui.entryPoint` and `ui.sidebar` are optional**, as they have always been in AMC, and now carry
  its length bounds (500 / 50 / 50). A manifest declaring only `ui: { hideProjectPanel: true }`
  installed fine and failed `amc-plugin validate` — the parity inversion pointing the wrong way.
- **`ctx.sessions.getMessages()` is typed** as `{ id, role, text, timestamp }` rather than
  `unknown[]`, and documented as the only one of the three message reads that filters nothing.
- **The mocks stopped inventing AMC behaviour.** `getMessages` resolved `[]` on every surface,
  which could never teach an author which field to read; both mocks now replay what they were sent
  in the real shape. The testing harness's `stop()` set the status to `'stopped'`, which is not one
  of the eleven statuses AMC can report.
- **Docs corrected.** `api/sessions.md` documented the `projectId` option, both wrong return types,
  and a `needs_input` status that does not exist. `guide/manifest.md` documented the two fictional
  migration ops and claimed migrations "run in order by version".

### Documented

- **`AgentMC.events.onSessionStatus` is not what its own comment claimed.** It said "sessions your
  plugin launched"; the host broadcasts every session's status change to every subscriber, with no
  ownership filter and no permission gate, so filter on `sessionId` yourself. It also fires **only
  in an overlay window** — the method exists in an in-panel webview because both share a preload,
  but nothing delivers the channel there, so a panel subscription is silently never called.
  `BridgeSessionStatusEvent` is now exported to document the payload; the callback parameter stays
  `unknown` deliberately, because the host validates that payload advisory-only and narrowing it
  would promise a guarantee nothing enforces.
- **Declared `migrations` are never executed by AMC.** They are parsed, validated, retained, and
  read by nothing — there is no migration runner and no path that can drop a plugin column or
  index. What actually evolves a schema is an automatic ADD COLUMN sweep on a version bump. The
  capability is kept and still validates so existing manifests work, but plugin authors had every
  reason to believe it did something.
- **The `ui` block stays optional here though AMC requires it** — a deliberate SDK-is-looser gap, so
  this SDK keeps accepting the backend-only manifests it always has.

**How this was verified.** Every item was checked against the AMC host source
(`Agent-Orchestrator` at `origin/master` 9a95c573fa), reading the actual handlers, Zod schemas and
the host's own locking tests — not against this SDK's mock. That distinction is the lesson behind
this whole changeset: the mock previously implemented `ctx.events` as a real in-memory emitter, so
plugin unit tests passed for months while the production path was dead in both directions. The
vendored values now live in `src/__tests__/fixtures/host-mirror.ts` with per-value
`file:line` citations.

## [1.3.0] - 2026-07-28

### Added

- **`AgentMC.events` — the renderer half of the plugin event bus is now typed.**
  The bus spans both of a plugin's surfaces, but the SDK could only describe the
  backend side, so the UI side was invisible to authors: a plugin panel had no
  documented way to reach its own backend and the workaround was polling a shared
  collection. The new `BridgeEvents` type is exported from the `./browser` entry
  point alongside the other bridge types.

  ```ts
  // In your UI
  window.AgentMC.events.emit('run.start', { id })
  const off = window.AgentMC.events.on('run.progress', (data) => render(data))
  ```

  `BridgeEvents extends PluginEvents` — `emit` and `on` are identical on both
  surfaces, so a channel means the same thing on either side and the shared half
  cannot drift. The UI adds `onSessionStatus`, which the backend has no use for.

  An `emit` fans out to both surfaces and is self-inclusive: the surface that
  emitted also receives, if it subscribed to that channel. It is fire-and-forget
  and returns nothing — a refusal (oversized payload, over-long channel) is
  logged to the plugin's own devtools console, not thrown. Payloads must survive
  JSON, so a `Date` arrives as an ISO string, and channels are scoped to your own
  plugin. See [Events](https://jlstradingco.github.io/amc-plugin-sdk/api/events)
  for the full rules.

- **`amc-automation` — a second binary for publishing AMC automations.** Until
  now the only way to share an automation was to build a recipe inside AMC's UI
  and click Publish; there was no way to validate one, publish from a repo or CI,
  or keep a published automation under version control. The automation catalog
  has been live and empty since it shipped.

  Four commands, mirroring the plugin CLI so anyone who has published a plugin
  already knows it:

  - `amc-automation init <name>` — scaffolds a `.recipe.json` plus a README. The
    template is a working two-step automation, not a stub: a test asserts that
    `init` followed by `validate` reports zero findings.
  - `amc-automation validate` — six groups of local checks (structure, steps,
    portability, secrets, marketplace limits, and an advisory list of fields the
    envelope will not carry). Exits `1` on an error, `0` on advisories only, so it
    drops into CI. `--json` for machine-readable findings.
  - `amc-automation publish` — validates, authenticates, and submits for review.
    `--dry-run`, `--as <user>`, `--version`, `--category`, `--changelog`.
  - `amc-automation status` — the review verdict, scoped to the automation in the
    current directory.

  It ships from `@agent-mc/plugin-cli` rather than a new package, so it shares
  the existing marketplace token, sign-in flow, docs site and release train.

  **Validation is deliberately split.** The share envelope's schema lives in AMC
  and is version-gated; copying it wholesale would recreate exactly the drift that
  stranded four permissions in 1.2.0. So the server holds the authoritative
  verdict (`validate --check`), and the local checks exist to fail the hopeless
  cases before an upload slot is spent.

  Two caveats, because the original framing of this split was too neat. First, the
  local checks are **not** purely advisory: `checkPortability` walks pipeline steps,
  which neither AMC's share gate nor the marketplace validator does, so it can
  refuse a submission the server would have accepted. That is intentional — a
  pipeline step running a local script installs fine and then cannot run, which is
  worse for the importer than a publish the author has to think about — and
  `--skip-validation` remains the way past it. Second, the values that *are*
  mirrored from the server (the id pattern, the version pattern, the categories,
  the step and definition allow-lists, the 200-step and 256 KB caps) do need parity
  guards, and now carry them: each is pinned by a test naming the file it was
  derived from.

  `validate --check` and `status` depend on the marketplace's `validateAutomation`
  and `getMyAutomations` endpoints. Where `validateAutomation` is not deployed,
  `--check` prints a notice and the local result stands; an unreachable server is
  never treated as a validation failure.

- **`amc-automation validate` takes `--version` and `--category`.** `--check`
  used to build its dry-run envelope with a placeholder version, which made the
  server's version-collision verdict meaningless. It now sends the same
  submission `publish` would, so "the marketplace accepts this" is an answer
  about the publish you are actually about to make.

- **`amc-automation publish` takes `--switch-account`,** matching `amc-plugin
  publish`. Both binaries share one token file, so switching here switches both.

- **API reference pages for the four 1.2.0 namespaces.** `tts`,
  `sessions.readHistory`, `firebase` and `spend` were typed, mocked and permitted,
  but every other namespace had a page under `/api/` and these four did not — so
  the headline capabilities of the release were the only ones an author browsing
  the reference could not find. Each page documents the surface, the failure modes
  that are expected rather than exceptional, and how to seed it in
  `createTestContext()`.

### Changed

- **The marketplace API moved off Firebase Cloud Functions.** It now runs inside
  AMC's own backend, mounted at `/marketplace` on the shared `amc-backend`
  service, and the CLI's default base URL points there. Every endpoint kept its
  exact name as a path segment, so nothing about the request or response shape
  changed and no command behaves differently.

  Both front doors read and write the same Firestore, so the previous Cloud
  Functions URL continues to serve while it remains deployed — an older installed
  CLI keeps working, and `AMC_MARKETPLACE_API_URL` still overrides the default for
  a staging or fork deploy.

- **An out-of-date CLI is now told so, instead of failing opaquely.** The
  marketplace can answer `426 Upgrade Required` once the legacy Cloud Functions
  are switched off. Because a published CLI hardcodes its API URL, that response
  is the only way an old install can learn why it stopped working — so it is
  raised as a distinct `MarketplaceUpgradeRequiredError` naming the exact fix
  (`npm i -g @agent-mc/plugin-cli@latest`) rather than a generic HTTP failure that
  looks retryable.

### Fixed

- **A published step no longer carries whatever the author's file happened to
  hold.** The envelope's allow-list stopped at the top level: `steps` and
  `pipelines` were copied VERBATIM, so every field inside a step travelled. The
  guarantee the allow-list exists to make — "anything not named here does not
  travel" — was therefore true of the recipe and false of its steps, which is
  where the author's own content lives. AMC's share path never had the hole; it
  maps every step through a 21-field allow-list first. Reachable by the ordinary
  workflow: copy a recipe out of AMC to edit as a file, and its step ids, local
  project references and engine pins all published. The same allow-list is now
  applied at both levels, and mirrored server-side so it no longer depends on
  every client choosing to honour it.

- **The secret scan covers every field a step publishes.** It named `prompt` and
  `exitMessage` by hand, which missed `approvalGate.message` and
  `supervisor.systemPrompt` — both free text, both shareable, and both scanned by
  AMC's own share-time scanner. A key pasted into either was flagged in the app
  and waved through by the CLI. The scan is now driven off the step allow-list, so
  a field added to the envelope is swept the day it is added, and a local-only
  field is deliberately not swept at all.

- **An entry that is not a step is reported instead of silently dropped.** The
  step collectors skip a `null` or a stray string so a malformed entry cannot
  renumber the steps around it — correct for labelling, but it meant no check ever
  saw them and the envelope then dropped them without a word. The author's
  published automation was missing a step, and nothing anywhere said so.

- **`validate --json` always emits a payload.** When the recipe file was missing,
  unreadable, not JSON, or ambiguous, it exited `1` having printed nothing — so a
  CI step parsing stdout received an empty string and had to special-case "no
  output" to tell a missing recipe from a crashed process. The file problem is now
  a `recipe-file` finding in the same payload shape as everything else.

- **The four namespaces this release adds are now importable by name.** `tts`,
  `sessions.readHistory`, `firebase` and `spend` got typed `ctx` namespaces and
  were re-exported from `src/types/index.ts` — which is INTERNAL. The package
  exposes `.`, `./browser`, `./validators` and `./testing` and nothing else, so
  `SpendReportBreakdown`, `PluginTts`, `HistoryMessage` and the rest could not be
  imported from `@agent-mc/plugin-sdk` at all. The namespaces still worked
  structurally through `PluginContext`, which is exactly why nothing caught it:
  an author could use them but not name them. A guard test now compares the two
  barrels as source text, so the next namespace cannot repeat it.

- **`--version` and `--category` are checked before an upload is spent.** Both
  were passed straight through to the marketplace, which refuses a non-semver
  version or an unknown category with a bare `400`. A refused upload still costs
  one of the five attempts an account gets per hour — the exact waste the local
  checks exist to prevent — and both flags are retyped on every publish, so they
  are where a typo lands. `init` had validated its own `--category` since it
  shipped; `publish` and `validate` trusted the same flag. Neither
  `--skip-validation` nor `--dry-run` bypasses this: a malformed version is not
  advice about your file, it is something the server cannot accept either way.

- **The step checks walk pipelines.** `recipe-steps.ts` was introduced so that
  every check reasoning about steps goes through one collector; `checkSteps` was
  the one that still read `recipe.steps` directly. A step inside a `pipelines`
  array with an empty prompt or no name published clean and then could not run —
  the precise outcome that check exists to prevent, since `pipelines` rides the
  publish envelope's allow-list and is executed like any other step.

- **The secret scan covers everything a publish ships.** It named `description`
  and `runLabel` by hand, leaving `parameters`, `onComplete` and `supervisors` —
  all on the envelope's allow-list, all able to carry an author's string —
  swept by nothing. It is now driven off `SHAREABLE_FIELDS` itself and descends
  into nested objects and arrays, so a field added to the envelope is scanned the
  day it is added. Still warnings only.

- **`validate` honours an explicit `null` token.** The option is typed
  `StoredToken | null`, so `null` means "signed out" — but `??` treated it as
  absent and fell through to the real disk-and-network lookup. `status` already
  had this right; the two now agree.

- **`amc-automation publish` now actually confirms the publishing account.**
  `-y` / `--yes` was declared, documented as "skip the identity confirmation
  prompt", threaded through the options and passed by every test — but never
  read, because no confirmation existed. Every publish went out unconfirmed
  under whatever account the browser happened to be signed into, while the
  plugin CLI has gated that same trap since it shipped. A published automation
  carries the author's name permanently, so this was the more consequential half
  of the pair. It now routes through the plugin CLI's own
  `evaluatePublishAccount` rather than a second copy, so the two binaries cannot
  drift apart again.

- **The local checks now walk `pipelines`.** A recipe holds steps in two places:
  the top-level `steps` array and the named arrays under `pipelines`. Both are
  published — `pipelines` is on the publish envelope's allow-list — but the
  portability and secret checks only ever walked `steps`, and the server does not
  walk pipelines either. So a `script` step or a pasted API key inside a pipeline
  reached the marketplace with no warning from either side. AMC's own share-time
  scanner has always walked both.

- **`validate` catches the marketplace's hard limits before an upload is spent.**
  The automation id is derived from the recipe name and never typed, so the
  server's `400` naming it was baffling. The marketplace requires 2–64
  characters: a one-character name slugged to one character, and the local
  100-character name limit slugged past 64 — both passed `validate` clean and
  were then refused. Step count (200) and definition size (256 KB) are checked
  locally for the same reason.

- **`amc-automation status` and `validate --check` renew the token silently.**
  Both read the stored token directly, so both announced "Not signed in" the
  moment the hour-long ID token lapsed — the same bug 1.2.0 fixed for `whoami`
  and `info`, left behind on the newer surface. The automation API client also
  now renews and retries a credential refused mid-flight, which only the plugin
  client did.

- **`amc-automation status` reports the server's own reason.** Every failure was
  reported as "Could not reach the marketplace. Check your connection", so a
  rejection the server had already explained sent authors off to debug their
  network instead.

- **A permanent `403` no longer re-uploads the package.** The renew-and-retry
  path treated every `401` and `403` as a stale credential, but the marketplace's
  `403` is `FORBIDDEN` — publishing into a namespace another developer owns —
  which no fresh token can change. The retry re-sent the entire request: up to
  50 MB of package bytes for a guaranteed failure, plus a second slot burned
  against the hourly upload limit. `401` still always retries; a `403` earns one
  only if its body says `AUTH_REQUIRED`.

- **`whoami` no longer promises a renewal it cannot guarantee.** A revoked
  session fails at exactly the renewal the message called silent.

- **The dev shell's mock spend report is stamped at the epoch,** matching
  `createTestContext`. A wall-clock timestamp made the two mocks disagree about
  the same host and made a plugin's own snapshot tests non-deterministic.

## [1.2.0]

### Added

- **Four permissions the SDK was missing.** `tts`, `sessions.readHistory`,
  `firebase` and `spend` are all gated by the AMC host and accepted by the
  marketplace validator, but the SDK's enum rejected them — so `amc-plugin
  validate` failed any plugin that declared one, and four shipped host
  capabilities were unbuildable with the public SDK. Among them
  `sessions.readHistory`, which backs AMC's documented "Session history access"
  feature, and `spend`, which AMC's own `daily-spend-report` plugin uses.

  Each also gets a typed `ctx` namespace, since a permission you can declare but
  not call is barely better than one that is rejected:

  - `ctx.tts` — `isAvailable()`, `synthesize(text)`. Metered; the host enforces a
    per-plugin daily cap and `synthesize()` rejects once it is hit.
  - `ctx.sessionHistory` — `requestAccess()`, `listProjects()`, `listSessions()`,
    `getMessages({ sessionId })`. Default-deny and text-only; `getMessages()`
    throws for a session the user never granted.
  - `ctx.firebase` — `listAccounts()`, `listProjects()`,
    `listProjectsForAccount(email)`, `setupStatus()`, `startLogin()`. Lists
    resolve empty rather than rejecting when the Firebase CLI is absent.
  - `ctx.spend` — `getBreakdown()`, returning the host's global spend report.

  Signatures were taken from the host's bridge handlers rather than an idealized
  shape, to avoid repeating the type drift 1.1.0 had to correct.

- `createTestContext()` mocks all four, reproducing the host's real posture —
  `sessionHistory` is default-deny, `tts` rejects with no voice configured, and
  the `firebase` lists resolve empty.

### Fixed

- **The CLI no longer makes you sign in again roughly every hour.** It has stored
  a refresh token since the first sign-in and never used it, so publishing a few
  versions in one afternoon meant several trips through GitHub OAuth. Renewal is
  silent, and every failure (expired, revoked, offline) still falls back to the
  interactive flow.

  Renewal also reaches the read-only commands. `whoami` and `info` read the
  stored token directly, so they announced "Not signed in" the moment the
  hour-long ID token lapsed — the very symptom the refresh exists to end. `info`
  now renews silently before checking marketplace status; `whoami` reports the
  stored identity (a local fact, no network) and says when renewal is pending.
  Neither can trigger a browser.
- **`logout` now clears an expired token instead of ignoring it.** It read
  through the same expiry check, so an expired token made it print "Not signed
  in" and return *without* deleting the file — stranding the long-lived refresh
  token on disk, which silent renewal then turns back into a working credential.
  Signing out has to remove the credential precisely when it looks stale.
- **`publish` no longer rejects the four permissions this release adds.** The
  preflight check kept its own hand-copied permission list, so a manifest
  declaring `tts`, `sessions.readHistory`, `firebase` or `spend` still failed at
  "Unknown permission(s)" and exited 1 — the SDK enum was fixed but the gate one
  layer out was not. That list is now derived from the SDK enum rather than
  restated, which also restores `system` and `chrome`, missing from it since
  before this release.
- **The marketplace token is stored `0600`.** Silent renewal turns the stored
  refresh token into an indefinitely reusable publish credential, so the default
  world-readable mode was no longer acceptable. Existing files are tightened on
  the next write.
- **A rejected token is renewed mid-flight.** Freshness is only checked before a
  command runs, so a long upload, a clock skewed past the 5-minute buffer, or a
  server-side revocation still met a raw `401`. Authenticated calls now renew and
  retry once — never twice, and never for non-auth failures.
- A renewed token's lifetime is floored at the freshness buffer, so a zero or
  negative `expires_in` can no longer mint a token that is expired on arrival.
- `createTestContext().ctx.firebase.startLogin()` now reports `started: false` by
  default (seedable via `firebase.loginStarts`), agreeing with the dev-shell mock
  and with its own `cliInstalled: false` default instead of contradicting both.
- **A fresh clone can build again.** `pnpm-workspace.yaml` carried unanswered
  `pnpm approve-builds` placeholders, which made pnpm 11 abort every install and
  script in the workspace with `ERR_PNPM_IGNORED_BUILDS`. CI never hit it because
  it passes `--ignore-scripts`. Also pins `packageManager`.
- The SDK↔host permission parity mirror claimed a 14-permission host union and
  reasoned that `firebase` was an ungated browser namespace. Both were wrong — the
  host declares 19 and denies the `firebase` namespace without the permission.
  Because the guard compared the SDK enum against that mirror, a wrong mirror and
  a wrong enum agreed and the suite stayed green while the gap above shipped. The
  guard now pins the host union size and requires every permission to have a typed
  namespace.
- Corrected the sign-in URL in the publishing guide (it named a host the CLI does
  not open) and documented all four new permissions, which had no reference entry.

### Compatibility

No breaking changes. Every 1.1.0 plugin builds unchanged; this release only widens
what a manifest may declare.

Note that AMC now enforces the `sdkVersion` field, which was never checked before.
A **bare** version (`"sdkVersion": "1.0.7"`) is read as a **minimum**, not an exact
pin, so existing plugins keep loading as the host SDK version advances. Only a real
range like `^2.0.0` can refuse, and an unparseable value is ignored.

## [1.1.0]

### Changed

- **`PluginDb` query/update types now match the host runtime.** The SDK types
  had drifted from the actual plugin host behavior; they are now aligned so
  what you write in a plugin compiles to exactly what the host executes.
  - `QueryOptions.orderBy` is now an object map, `Record<string, 'asc' | 'desc'>`,
    replacing the previous string-based `order` field. The host has always
    ordered from this object form.
    ```ts
    // Before (SDK type only — never matched the host)
    ctx.db.query('notes', { order: 'createdAt desc' })
    // After (matches the host runtime)
    ctx.db.query('notes', { orderBy: { createdAt: 'desc' } })
    ```
  - `PluginDb.update(...)` now returns `Promise<void>` instead of resolving to
    the updated row. The host update path does not return the row.

  These are compile-time type corrections. Plugins were already running against
  the object-`orderBy` / void-`update` runtime, so no runtime behavior changes —
  but a plugin whose TypeScript relied on the old (incorrect) `order` string or
  on `update` returning a row will need the one-line adjustments above.

### Fixed

- Cleared the two resolved entries from the SDK↔host type-parity guard fixture
  now that both historical deltas (`QueryOptions.orderBy` and `PluginDb.update`)
  are closed.

### Dependencies

- Bumped vulnerable dev/build dependencies (`vitest`, `vite`, `esbuild`) to
  patched versions and pinned scoped `pnpm` overrides so the fixes stay in the
  resolved tree. No changes to the published runtime dependency (`zod`).

### Dev Shell

- Brought `@agent-mc/plugin-dev-shell` onto the shared release train (it was
  lagging at `1.0.0`). Its mock context already implements the aligned
  `orderBy` / `update` types from #33; it now ships them as `1.1.0`.
- Added a `files: ["dist"]` allow-list so `npm publish` ships only the built
  output (matching `plugin-sdk` and `plugin-cli`) instead of the whole package.
  Its `@agent-mc/plugin-sdk` dependency stays at `^1.0.0`, which already
  satisfies `1.1.0`.

## [1.0.7]

- Baseline for this changelog. See the git history for changes prior to 1.1.0.
