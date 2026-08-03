# Releasing the SDK

How to publish `@agent-mc/plugin-sdk`, `@agent-mc/plugin-cli` and
`@agent-mc/plugin-dev-shell`. The three are **released together** on one version
number.

There is no publish automation. `.github/workflows/ci.yml` only builds and tests;
nothing in CI ever runs a publish. Every release is a human running the steps
below.

## The one thing that will bite you

**Publish with `pnpm publish`, never `npm publish`.**

`packages/cli` and `packages/dev-shell` both declare their SDK dependency as
`"@agent-mc/plugin-sdk": "workspace:^"`. That is not a real npm range — pnpm
rewrites it to a concrete version at publish time. `npm publish` ships the
literal `workspace:^` string to the registry, and every consumer's install
breaks.

## Before you publish

1. **Working tree clean, on `master`, up to date with `origin/master`.**
2. **Green locally, the same way CI runs it:**
   ```sh
   pnpm install --frozen-lockfile --ignore-scripts
   pnpm -r build            # tsc across every package; emits dist/
   pnpm run typecheck       # the tests too — the build configs exclude them
   pnpm run typecheck:examples
   pnpm --workspace-concurrency=1 -r test
   ```
   `pnpm -r build` is not the whole typecheck. The build configs exclude
   `src/__tests__` so the published package does not carry its own specs, which
   means a broken spec — or a compile-time guard assertion that no longer holds —
   passes the build and only `pnpm run typecheck` catches it.
   Keep `--ignore-scripts` on the install. CI passes it to skip electron's binary
   download (a dev-shell dependency that `tsc` and the mock-context tests never
   need). It has a second benefit locally: without it, pnpm 10+ writes an
   `allowBuilds:` block full of placeholder text into `pnpm-workspace.yaml` and
   then fails every later `pnpm run …` until you answer it, which also leaves
   your working tree dirty mid-release.
3. **`npm whoami`** — you must be authenticated as a publisher for the
   `@agent-mc` scope.

## Cutting the release

1. **Bump all three `package.json` versions** to the new number, in the same
   commit. Do not stagger them; a partial bump is how `dev-shell` drifted to
   `1.0.0` while the others were at `1.0.7`.
2. **Add a `CHANGELOG.md` section** at the top, following Keep a Changelog.
   If a previous version was stamped but never published, say so in the new
   section and tell upgraders to read the skipped section too — the registry's
   `latest` is the only version anyone actually has. (This is not hypothetical:
   `1.1.0` was stamped, changelogged, and never published; `1.2.0` had to carry
   its breaking `PluginDb` change forward.)
3. Commit as `chore(release): bump sdk+cli+dev-shell to X.Y.Z with CHANGELOG`,
   open a PR, and land it once CI is green.

## Publishing

Publish the SDK **first** — the other two depend on it.

```sh
pnpm --filter @agent-mc/plugin-sdk publish --access public
pnpm --filter @agent-mc/plugin-cli publish --access public
pnpm --filter @agent-mc/plugin-dev-shell publish --access public
```

Only `plugin-sdk` has a `prepublishOnly` hook, so it rebuilds itself. **Build the
other two yourself first** (`pnpm -r build` above covers it) or you will publish
a stale `dist/`.

Then verify what the registry actually serves, rather than assuming:

```sh
npm view @agent-mc/plugin-sdk version
npm view @agent-mc/plugin-cli dependencies      # must show a real range, NOT workspace:^
npm view @agent-mc/plugin-dev-shell version
```

## After publishing

1. **Tag it.** `git tag vX.Y.Z && git push origin vX.Y.Z`. The repo currently has
   no tags at all, which is why "was 1.1.0 ever released?" took a registry query
   to answer.
2. **Sweep the version drift.** Several places pin a published SDK range and can
   only be updated once the version exists on npm:
   - `examples/*/package.json` — the `@agent-mc/plugin-sdk` dependency range.
   - `examples/*/manifest.json` — the `sdkVersion` range.
   - Any README or doc that names the current version.
   Land this as a follow-up commit (`docs: sweep SDK version drift after the
   X.Y.Z release`). Doing it *before* publishing would point the examples at a
   version nobody can install.
   Leave `packages/cli/src/commands/create.ts`'s scaffold `sdkVersion` alone
   unless you mean to raise the floor for newly created plugins — it is
   deliberately wide.
3. **Reconcile the AMC host, if permissions changed.** The AMC app keeps an
   acknowledgement fixture at `tests/unit/lint/fixtures/sdk-permission-support.ts`
   listing which permissions the published SDK understands, guarded by
   `plugin-sdk-permission-parity`. If this release added a permission, move it
   out of `SDK_PENDING_PERMISSIONS` and bump `SDK_RECONCILED_VERSION` there.

## Version numbering

Semantic versioning, against **what is on npm** — not against the last number
committed here. A stamped-but-unpublished version is not a release.

A breaking change is anything that makes a previously-compiling plugin stop
compiling: removing or narrowing an exported type, tightening the manifest
schema, or changing a method signature. Adding a type, adding a permission to
the valid set, or adding an optional field is a minor.
