# Changelog

All notable changes to the AMC Plugin SDK are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions listed here cover the published packages `@agent-mc/plugin-sdk` and
`@agent-mc/plugin-cli`, which are released together.

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

## [1.0.7]

- Baseline for this changelog. See the git history for changes prior to 1.1.0.
