/**
 * THE ONE RULE for a path a plugin manifest declares: it names a file INSIDE the plugin's
 * own package.
 *
 * There used to be three answers to that question, in three build roots that cannot import
 * each other — the app's `plugin-manifest-validator`, and the marketplace's package validator in
 * BOTH `amc-back` and `firebase/marketplace/functions`. T-92 wired the rule into the app; the two
 * server trees kept accepting an entry point that escapes the package, and so did the app's own
 * sandbox preview. This module is the rule those doors now share.
 *
 * WHY IT IS COPIED, AND WHY THAT IS STILL ONE RULE. `amc-back` and `firebase/marketplace/functions`
 * both declare `rootDir: "src"`, so neither can import a file under the app's `src/` — the same wall
 * the marketplace capability-envelope policy hit (see `firebase/marketplace/SURFACE-AUTHORITY.md`
 * and tests/unit/lint/marketplace-automation-envelope-policy-parity.test.ts). The repo's answer,
 * used here, is one rule text held byte-identical in every copy and pinned so a hand edit cannot
 * survive: tests/unit/lint/marketplace-plugin-entry-path-parity.test.ts compares the three copies
 * AND runs one shared payload table through all of them. Edit one copy alone and the build fails.
 *
 * DEPENDENCY-FREE ON PURPOSE — no imports, no zod, no node builtins. A copy has to typecheck and
 * run under the app's bundler config, the app's Node config, `amc-back`'s Bun workspace and the
 * Cloud Functions `tsc` bundle. Anything imported here would have to resolve in all four.
 *
 * It is a LITERAL relative path, but the check runs on the PATH-ESCAPE-RESOLVED form, and that is
 * load-bearing rather than defensive: the URL-served consumers interpolate the value into a URL by
 * string concatenation (`PluginWebviewHost` builds
 * `http://127.0.0.1:<port>/plugin/<id>/<entryPoint>`), and the WHATWG parser NORMALISES before it
 * splits path segments — it deletes every tab, LF and CR from the input, then percent-decodes.
 * Measured: `new URL('http://h/plugin/a/%2e%2e/b/index.html').pathname` is `/plugin/b/index.html`,
 * and so is `new URL('http://h/plugin/a/..\t/b/index.html').pathname` — two different spellings that
 * carry no literal `..` segment, both reaching the server as one and crossing into ANOTHER plugin's
 * package. `resolveManifestPathEscapes` removes exactly what the parser removes, so the checks below
 * judge the value the URL layer will actually resolve.
 *
 * TWO OF THE SEVEN DIMENSIONS ARE SHAPE, NOT CONTAINMENT — `blank` and `too-long` — and a third,
 * `control-character`, is the ASCII whitespace a URL parser DELETES. All three are stated here
 * rather than left in the host validator because the rule is only ONE rule if the copies can
 * enforce all of it: a submission the marketplace accepts and every client then refuses to load is
 * the same defect the containment dimensions exist to prevent, and a hardening written as a
 * validator-only refine would never turn these copies red.
 */

/**
 * A way a declared entry path is not a usable path inside the plugin's own package.
 *
 * `blank` and `too-long` do not escape the package — they are here because they are part of what
 * the app ACCEPTS, and this module is the one statement of that. Leaving them behind in the host
 * validator is exactly how the marketplace came to accept a manifest every client then refuses to
 * load, and how a later hardening written there would never turn these copies red.
 */
export type ManifestEntryPathProblem =
  | 'not-a-string'
  | 'blank'
  | 'too-long'
  | 'control-character'
  | 'scheme'
  | 'absolute'
  | 'drive'
  | 'parent-segment'

/** Longest a declared entry path may be. The app has always capped at this; the copies did not. */
export const MANIFEST_ENTRY_PATH_MAX = 500

/**
 * The ASCII characters a URL parser DELETES from its input outright, before it does anything else.
 *
 * A declared path is REFUSED for carrying one, rather than having it quietly resolved away. Both
 * halves are needed and they answer different questions: the refusal is the rule (a path field has
 * no business containing one, and the value a manifest declares should be the value that is
 * served), while removing them — see `resolveManifestPathEscapes` — is what makes the containment
 * dimensions judge what the URL layer will actually see.
 */
const URL_STRIPPED_WHITESPACE_RE = /[\t\n\r]/

/** `file:`, `http:`, and every other scheme-bearing value that would not name a file in the package. */
const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*:)/

/** A Windows drive-qualified path (`C:\…`, `C:/…`). */
const DRIVE_RE = /^[a-zA-Z]:/

/** Both separators: a manifest written on either platform must fail on both. */
const SEGMENT_SPLIT_RE = /[/\\]/

/**
 * Percent-escapes that can name a PATH character once a URL layer decodes them, plus the ASCII
 * whitespace the URL parser DELETES outright. A plugin-relative path is a literal filesystem path,
 * so neither has a legitimate place in it — but every URL-served consumer concatenates the value
 * into a URL, and the WHATWG parser normalises it first: it removes all tab, LF and CR from the
 * input, then percent-decodes, then splits segments. So `%2e%2e/` IS a `..` segment, `%2f` IS a
 * separator, and `..\t` IS a `..` segment. Measured: `new URL('http://h/plugin/a/..\t/b/x.html')`
 * has pathname `/plugin/b/x.html`. Resolving them here makes every check below see what the URL
 * layer will see. `%20`, `%25` and friends are left alone: they name no path character and stay a
 * literal filename.
 */
export function resolveManifestPathEscapes(value: string): string {
  return value
    .replace(/[\t\n\r]/g, '')
    .replace(/%2e/gi, '.')
    .replace(/%2f/gi, '/')
    .replace(/%5c/gi, '\\')
}

/**
 * EVERY way this value leaves the package, in the order the manifest validator reports them.
 *
 * It returns all of them rather than the first, because the host validator reports one zod issue
 * per dimension and a value that breaks two (an absolute path containing `..`) has always produced
 * two lines in its error string. Returning the first would silently shorten that message, which is
 * a behaviour change this rule has no reason to make.
 */
export function manifestEntryPathProblems(value: unknown): ManifestEntryPathProblem[] {
  // A DECLARED path that is not a string is refused rather than skipped. Skipping it was the
  // marketplace's "accepts what every client refuses" defect again: the app's schema is
  // `z.string()`, so `ui.entryPoint: 123` never loads, while a collector that only reads strings
  // reported the field as absent and let it publish clean.
  if (typeof value !== 'string') return ['not-a-string']
  const problems: ManifestEntryPathProblem[] = []
  // Shape before containment: a value the app will not accept as a path at all is reported first,
  // and is judged on its RAW form — resolving escapes cannot make a blank value non-blank.
  if (value.trim().length === 0) problems.push('blank')
  if (value.length > MANIFEST_ENTRY_PATH_MAX) problems.push('too-long')
  if (URL_STRIPPED_WHITESPACE_RE.test(value)) problems.push('control-character')
  const resolved = resolveManifestPathEscapes(value)
  if (SCHEME_RE.test(resolved)) problems.push('scheme')
  if (resolved.startsWith('/') || resolved.startsWith('\\')) problems.push('absolute')
  if (DRIVE_RE.test(resolved)) problems.push('drive')
  // Segment-wise rather than substring matching on purpose: a plain substring test for '..' would
  // wrongly reject a legitimate filename like `my..page.html`.
  if (resolved.split(SEGMENT_SPLIT_RE).includes('..')) problems.push('parent-segment')
  return problems
}

/**
 * Every manifest field that names a file inside the plugin package. This is the ONE declaration of
 * the set — a new path-typed field belongs here, and the host validator's own table
 * (tests/unit/services/plugin-manifest-validator.test.ts) pins the same six.
 */
export const MANIFEST_ENTRY_PATH_FIELDS = [
  'ui.entryPoint',
  'ui.overlay.entryPoint',
  'ui.settingsPanel.entryPoint',
  'ui.widget.entryPoint',
  'ui.windows[].entryPoint',
  'backend.entryPoint'
] as const

/** One declared entry path, with the manifest field it came from (for the refusal message). */
export interface ManifestEntryPath {
  field: string
  value: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function collect(entries: ManifestEntryPath[], field: string, value: unknown): void {
  // Whatever was DECLARED, not only a string: a declared non-string is a refusal this rule owns
  // (see `manifestEntryPathProblems`). An absent field is different — a path-typed field may be
  // optional, and whether one is required is the manifest schema's question, not this one's.
  if (value !== undefined) entries.push({ field, value })
}

/**
 * Read the six declared entry paths out of an UNVALIDATED manifest.
 *
 * Takes `unknown` and never throws: it runs on raw `JSON.parse` output, where any field may be
 * absent or the wrong type, and a shape problem is the manifest schema's to report, not this one's.
 */
export function collectManifestEntryPaths(manifest: unknown): ManifestEntryPath[] {
  const root = asRecord(manifest)
  if (!root) return []
  const ui = asRecord(root.ui)
  const entries: ManifestEntryPath[] = []
  collect(entries, 'ui.entryPoint', ui?.entryPoint)
  collect(entries, 'ui.overlay.entryPoint', asRecord(ui?.overlay)?.entryPoint)
  collect(entries, 'ui.settingsPanel.entryPoint', asRecord(ui?.settingsPanel)?.entryPoint)
  collect(entries, 'ui.widget.entryPoint', asRecord(ui?.widget)?.entryPoint)
  const windows = asRecord(ui?.windows)
  if (windows) {
    for (const key of Object.keys(windows)) {
      collect(entries, `ui.windows.${key}.entryPoint`, asRecord(windows[key])?.entryPoint)
    }
  }
  collect(entries, 'backend.entryPoint', asRecord(root.backend)?.entryPoint)
  return entries
}

/**
 * The first declared entry path that leaves the package, or null when every one is contained.
 * This is what a validator that has no per-field schema calls.
 */
export function findUnsafeManifestEntryPath(manifest: unknown): ManifestEntryPath | null {
  for (const entry of collectManifestEntryPaths(manifest)) {
    if (manifestEntryPathProblems(entry.value).length > 0) return entry
  }
  return null
}
