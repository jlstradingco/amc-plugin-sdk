# Releasing the SDK

How `@omniscio/plugin-sdk`, `@omniscio/plugin-cli` and `@omniscio/plugin-dev-shell` reach npm.
The three are **released together** on one version number.

The packages live in **`plugin-sdk/` inside the Omniscio repository**. That folder is the source
of truth; `github.com/jlstradingco/amc-plugin-sdk` is a read-only mirror the app syncs from it,
and nothing is ever committed there by hand.

**A release is a version bump that lands on the Omniscio repository's `master`.** The mirror picks
the folder up on its next sync, and the mirror's `publish.yml` workflow publishes every version npm
does not have yet. Nobody holds an npm key: npm trusts that one workflow in that one repository
(npm "trusted publishing"), and every version it publishes carries a public provenance record of
the commit and run that built it.

## The folder stands alone

The mirror is this folder and nothing else, so nothing in it may reach outside it.

- **Every build, test and script works with no Omniscio repository around it.** The host test
  `tests/unit/plugins/sdk-folder-stands-alone.test.ts` (in the Omniscio repository) fails on any
  path in this folder that resolves outside it — in package scripts, string paths, and
  `path.join` / `path.resolve` / `new URL` calls, however they are wrapped.
- **`scripts/run-work-entry.mjs` runs package entries.** Inside the Omniscio repository it hands
  the call to the repository's own work runner, so the repository's admission rules still apply;
  in the mirror there is no such runner and it runs the entry directly. If it finds the Omniscio
  repository but not its runner, it refuses rather than run the entry unadmitted.
- **A comparison against the app belongs in the app's tests**, not here — for example
  `tests/unit/plugins/sdk-namespace-members.test.ts` checks the published bridge and context types
  against the app's own surface.
- **The docs site is built by the Omniscio repository**, which publishes it at
  [docs.omniscio.com/sdk](https://docs.omniscio.com/sdk/). The folder's `build` script builds only
  `packages/*`, and the mirror has no docs workflow.

## What the mirror's workflows run

GitHub reads workflows only at a repository's root, so the two files in `.github/workflows/` run
**in the mirror**, where this folder is the root.

- **`ci.yml`** — on every push, pull request and manual start: install, `pnpm build`,
  `pnpm run typecheck`, `pnpm run typecheck:examples`, `pnpm --workspace-concurrency=1 -r test`.
  - `pnpm install` keeps `--ignore-scripts`: it skips electron's binary download, a dev-shell
    dependency that no build or test launches.
  - pnpm is pinned to the major that `package.json`'s `packageManager` names, so a new pnpm major
    never arrives unannounced.
  - `pnpm build` is not the whole typecheck: the build configs exclude `src/__tests__` so the
    packages do not ship their own specs, and only `pnpm run typecheck` checks those.
  - The examples are not workspace members (each pins a published range so an author can copy one
    out), so `typecheck:examples` checks them against the freshly built local `dist/`.
  - Tests run one package at a time so the CLI's real-`tsc` end-to-end test is not starved.
- **`publish.yml`** — on a push to `master` that changes a `packages/*/package.json`, and on a
  manual start: install, build, typecheck, test, then `node scripts/publish-unreleased.mjs`.
  - It never runs on a pull request, and two runs never publish at once.
  - Its only credential is the short-lived token GitHub issues to that run (`id-token: write`).
  - A manual start defaults to a **dry run**: every package is packed and checked, each version
    npm lacks is rehearsed with `npm publish --dry-run` (npm refuses even a rehearsal of a version
    it already has), and nothing is published.

## How a version is published

`scripts/publish-unreleased.mjs` asks npm about each package in dependency order — the SDK, then
the dev shell, then the CLI — and for each version npm lacks:

1. `pnpm pack` writes the tarball. pnpm rewrites the `workspace:^` ranges to real versions; the
   script refuses a tarball whose `package.json` still carries one.
2. `npm publish <tarball> --access public` publishes it through trusted publishing.

A version npm already has is skipped, so a re-run after a partial failure publishes only what is
missing. An npm lookup that fails for any reason other than "not found" stops the run rather than
being read as "already published". **Never `npm publish` a package folder by hand**: npm ships
`workspace:^` literally and every consumer's install breaks.

## Cutting a release

1. **Bump all three `package.json` versions** to the new number in one commit. Never stagger
   them — a partial bump is how `dev-shell` drifted to `1.0.0` while the others were at `1.0.7`.
2. **Regenerate the SDK's facts** from the Omniscio repository root:
   `npm run scripts:run -- plugin-kit:generate`, and commit what it changes. The host's plugin-SDK
   contract version is generated from `packages/sdk/package.json`; never hand-edit it.
3. **Turn `## [Unreleased]` in `CHANGELOG.md` into the new version's section.** If a previous
   version was stamped but never published, say so and tell upgraders to read the skipped section
   too — the registry's `latest` is the only version anyone actually has. (`1.1.0` was stamped,
   changelogged and never published; `1.2.0` had to carry its breaking `PluginDb` change forward.)
4. **Land it on `master`** through the app's normal landing flow, as one commit touching only
   `plugin-sdk/` (plus the regenerated facts). Then check, rather than assume:
   ```sh
   npm view @omniscio/plugin-sdk version
   npm view @omniscio/plugin-cli dependencies      # real ranges, never workspace:^
   npm view @omniscio/plugin-dev-shell version
   ```
   Each version's npm page shows its provenance: the mirror commit and the workflow run.

To rehearse without publishing, start the mirror's **Publish** workflow by hand with *dry run*
left on.

## npm's side

Each of the three packages names one trusted publisher: GitHub Actions, `jlstradingco` /
`amc-plugin-sdk` / `publish.yml`, allowed to publish directly. Publishing access is set to
"Require two-factor authentication and disallow tokens", so no key can publish, even a leaked one.

- **Never rename `publish.yml`** or move the mirror: npm matches the workflow filename and the
  repository exactly, and a mismatch refuses every publish.
- A **new** package needs its trusted publisher added on npm before its first automated publish,
  and npm expires a trusted-publisher entry that is not used to publish within 2 days of its
  creation — create it on the day of the release that first uses it.
- The `omniscio` npm organization owns the `@omniscio` scope.

## After publishing

1. **Tag it in the Omniscio repository** — `git tag plugin-sdk-vX.Y.Z` on the release commit.
   The mirror carries no tags, so this tag is the only record of which commit shipped which
   version. Never push it to GitHub without the owner's say-so.
2. **Sweep the version drift.** Places that pin a published range — `examples/*/package.json` and
   any README that names the current version — can only move once the version exists on npm. Land
   that as a follow-up commit (`docs: sweep SDK version drift after the X.Y.Z release`).
   **Never sweep a manifest `sdkVersion`** — not in `examples/*/manifest.json`, not in the docs,
   not in `packages/cli/src/commands/create.ts`. It is the Omniscio host's plugin-SDK contract
   (`AMC_PLUGIN_SDK_VERSION` in the Omniscio repository's `src/shared/plugin-sdk-version.ts`), not
   this package's version, and the host reads a bare version as a minimum. Moving it to `^3.0.0`
   with the 3.0.0 release made Omniscio (contract `2.0.0`) hide every plugin that CLI scaffolded.
   Raise it only when the host constant moves, and update the host copy in
   `packages/cli/src/__tests__/host-sdk-contract.test.ts` in the same change. The scaffold's npm
   range (`buildPackageJson` in the same file) follows this package: raise it in the release
   commit of a new major.
3. **Reconcile the Omniscio host if permissions changed.** The app's acknowledgement fixture
   `tests/unit/lint/fixtures/sdk-permission-support.ts` lists which permissions the published SDK
   understands, guarded by `plugin-sdk-permission-parity`. If this release added one, move it out
   of `SDK_PENDING_PERMISSIONS` and bump `SDK_RECONCILED_VERSION` there.

## Never bump the SDK to a new major without the host

The host's plugin-SDK contract (`AMC_PLUGIN_SDK_VERSION`, generated into
`packages/sdk/src/generated/sdk-facts.ts`) is read from `packages/sdk/package.json`. A plugin
declaring `sdkVersion: "^3.0.0"` loads only while that constant is on major 3, so moving the
package to `4.0.0` hides every caret-pinned plugin until the host's relabel rule covers it. Ship a
rename or an additive change as a minor; raise the major only together with the host's
compatibility rule, and run the plugin-compatibility tests with `^1`, `^2`, `^3` and bare pins.

## The old `@agent-mc/*` names

The packages were published as `@agent-mc/plugin-sdk`, `@agent-mc/plugin-cli` and
`@agent-mc/plugin-dev-shell` up to 3.3.0. Those versions stay on npm, untouched, so every plugin
pinned to them keeps installing. An `@agent-mc` maintainer marks them as moved (this changes no
installed plugin; it only prints a notice on install):

```sh
npm deprecate "@agent-mc/plugin-sdk@*" "Renamed to @omniscio/plugin-sdk — the same SDK; 3.3.0 keeps working"
npm deprecate "@agent-mc/plugin-cli@*" "Renamed to @omniscio/plugin-cli (it still answers to amc-plugin)"
npm deprecate "@agent-mc/plugin-dev-shell@*" "Renamed to @omniscio/plugin-dev-shell"
```

Never publish a new version under the old names: a forwarding package would be picked up by every
existing `^3` plugin on its next install, swapping its code for something it never asked for.

## The plain command names are held

The unscoped `omniscio-plugin` and `amc-plugin` packages (0.0.1) belong to the `omniscio`
organization's account. Each only prints "install `@omniscio/plugin-cli`" and exits 1, so an author
who types `npx omniscio-plugin` without the CLI installed never runs a stranger's code.

## Version numbering

Semantic versioning, against **what is on npm** — not against the last number committed here. A
stamped-but-unpublished version is not a release.

A breaking change is anything that makes a previously-compiling plugin stop compiling: removing or
narrowing an exported type, tightening the manifest schema, or changing a method signature. Adding
a type, adding a permission to the valid set, or adding an optional field is a minor.
