/**
 * Provenance and payload table for the vendored host entry-path rule.
 *
 * `../../validators/manifest-entry-path.ts` is a BYTE-IDENTICAL copy of the host's
 * `src/shared/plugin-manifest-entry-path.ts` (Agent-Orchestrator). The host wrote that module
 * dependency-free precisely so other build roots could hold an exact copy of it, and it keeps two
 * such copies itself (the marketplace validators). This SDK is a fourth door: before this copy,
 * `amc-plugin validate` checked only "1 to 500 characters" on three fields and never saw the other
 * three, so it approved `%2e%2e/`, `..\t`, `C:\…` and `/abs` entry points the app refuses to load.
 *
 * host-entry-path-parity.test.ts reads this file. It fails when:
 *  - the vendored copy's git blob SHA stops matching `blobSha` (a hand edit), or
 *  - `reconciledAt` is older than the staleness budget (nobody re-checked the host), or
 *  - AMC_HOST_ENTRY_PATH_PATH points at a host checkout whose file differs from the copy.
 *
 * TO RECONCILE: read the host file from GitHub master (a local host checkout can be thousands of
 * commits stale), copy it over the vendored file unchanged, then update all four fields below and
 * re-copy the payload table from the host's
 * tests/unit/lint/marketplace-plugin-entry-path-parity.test.ts.
 *
 *   gh api repos/jlstradingco/Agent-Orchestrator/contents/src/shared/plugin-manifest-entry-path.ts \
 *     --jq .content | base64 -d > packages/sdk/src/validators/manifest-entry-path.ts
 *   gh api 'repos/jlstradingco/Agent-Orchestrator/commits?path=src/shared/plugin-manifest-entry-path.ts&per_page=1' \
 *     --jq '.[0].sha'
 *   git hash-object packages/sdk/src/validators/manifest-entry-path.ts
 */
export const HOST_ENTRY_PATH_PROVENANCE = {
  hostFile: 'src/shared/plugin-manifest-entry-path.ts',
  /** ISO date the copy was last compared against the host's GitHub master. */
  reconciledAt: '2026-10-14',
  /** Latest host commit touching hostFile on that date (2026-10-14T12:39:16Z). */
  sourceCommit: 'cdee3215831673b3030dcee563e2c04868aeae16',
  /** `git hash-object` of hostFile at sourceCommit — and of the vendored copy. */
  blobSha: '5e316d12969d6fa6de6abe631a9e501a7b3e6a11',
} as const

/**
 * The host's own shared payload table, copied from
 * tests/unit/lint/marketplace-plugin-entry-path-parity.test.ts at sourceCommit.
 */

/** Values the host refuses as a plugin-relative entry path. */
export const HOSTILE_ENTRY_PATHS: ReadonlyArray<{ label: string; value: unknown }> = [
  { label: 'an empty value', value: '' },
  { label: 'a whitespace-only value', value: '   ' },
  { label: 'a value past the length bound', value: 'a'.repeat(501) },
  { label: 'a leading ".." segment', value: '../../etc/passwd' },
  { label: 'a nested ".." segment', value: 'ui/../../../etc/passwd' },
  { label: 'a bare ".."', value: '..' },
  { label: 'a backslash ".." segment', value: '..\\..\\windows\\system32\\x.html' },
  { label: 'a POSIX-absolute path', value: '/etc/passwd' },
  { label: 'a Windows drive-qualified path', value: 'C:\\Windows\\x.html' },
  { label: 'a UNC share path', value: '\\\\attacker.example\\share\\x.html' },
  { label: 'a file: URL', value: 'file:///etc/passwd' },
  { label: 'an https: URL', value: 'https://attacker.example/x.html' },
  { label: 'a percent-encoded ".." segment', value: '%2e%2e/other-plugin/index.html' },
  { label: 'an uppercase percent-encoded ".." segment', value: '%2E%2E/other-plugin/index.html' },
  { label: 'a dot fused with a percent-encoded dot', value: '.%2e/other-plugin/index.html' },
  { label: 'a percent-encoded separator', value: '..%2f..%2fetc/passwd' },
  { label: 'a percent-encoded LEADING separator', value: '%2fetc/passwd' },
  { label: 'a percent-encoded backslash segment', value: '..%5c..%5cwindows%5cx.html' },
  { label: 'a tab inside a ".." segment', value: '..\t/other-plugin/index.html' },
  { label: 'a newline inside a ".." segment', value: '..\n/other-plugin/index.html' },
  { label: 'a carriage return inside a ".." segment', value: '..\r/other-plugin/index.html' },
  { label: 'a tab between the dots', value: '.\t./other-plugin/index.html' },
  { label: 'a tab inside a filename', value: 'ui/ta\tb.html' },
  { label: 'a newline inside a filename', value: 'ui/ta\nb.html' },
  { label: 'a value that is not a string', value: 123 },
]

/** Values the host accepts — the rule must refuse nothing honest. */
export const LEGITIMATE_ENTRY_PATHS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'a plain UI bundle path', value: 'ui/index.html' },
  { label: 'a built UI bundle path', value: 'dist/ui/index.html' },
  { label: 'a built backend path', value: 'dist/backend/index.js' },
  { label: 'a dot in a filename (not a ".." segment)', value: 'my..page.html' },
  { label: 'a dot-segment that never leaves the folder', value: 'a/./b.html' },
  { label: 'a percent-escape that names no path character', value: 'dist/ui/a%20b.html' },
]

/**
 * A trailing space inside a dot segment. The host deliberately settles neither way on these and
 * only asserts every door AGREES, so the SDK test does the same: the schema's verdict must match
 * the vendored rule's.
 */
export const UNSETTLED_ENTRY_PATHS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'a space after ".."', value: '.. /x.html' },
  { label: 'a trailing space on a nested ".."', value: 'a/.. /x.html' },
]
