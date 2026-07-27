# Changelog

All notable changes to the AMC Plugin SDK are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions listed here cover the published packages `@agent-mc/plugin-sdk`,
`@agent-mc/plugin-cli`, and `@agent-mc/plugin-dev-shell`, which are released
together.

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
