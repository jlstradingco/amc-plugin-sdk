import { z } from 'zod'
import { PLUGIN_PERMISSIONS, PROCESS_INTERPRETER_DENYLIST } from '../generated/sdk-facts.js'
import { COMMAND_TABLE_WAIVER_MAX_CHARS, COMMAND_TABLE_WAIVER_MIN_CHARS } from './command-tables.js'
import {
  manifestEntryPathProblems,
  MANIFEST_ENTRY_PATH_MAX,
  type ManifestEntryPathProblem,
} from './manifest-entry-path.js'

const pluginIdRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * The host's identifier rule for anything it interpolates into SQL DDL/DML —
 * collection names, column names, index members, and the migration equivalents
 * (`plugin-manifest-validator.ts`, `sqlIdentRegex`).
 *
 * This is not decoration and it is not SDK-invented policy: the host wraps these
 * names in double quotes WITHOUT escaping an embedded `"`, so the regex is the
 * injection boundary. The SDK validated none of it, which meant a manifest
 * declaring a collection called `x"; DROP TABLE --` passed `amc-plugin validate`,
 * passed the marketplace review pipeline, and then failed to install on every
 * user's machine.
 */
const sqlIdentRegex = /^[a-z_][a-z0-9_]*$/i
const sqlIdentMessage =
  'must be a SQL identifier: a letter or underscore followed by letters, digits or underscores'
const sqlIdent = (): z.ZodString =>
  z.string().min(1).regex(sqlIdentRegex, sqlIdentMessage)

// Marketplace listing bounds — ONE URL cap shared by screenshots and links. Kept in
// sync with the AMC host validator (plugin-manifest-validator.ts: PLUGIN_SCREENSHOTS_MAX,
// plus PLUGIN_SCREENSHOT_URL_MAX and PLUGIN_LINK_URL_MAX, which are both 2048) and the
// marketplace's sanitizeScreenshotUrls (upload-plugin.ts). The host-parity test reads the
// same numbers from __tests__/fixtures/host-mirror.ts (HOST_LISTING_BOUNDS), so a host
// cap change fails there instead of drifting silently.
const LISTING_URL_MAX = 2048
const SCREENSHOTS_MAX = 8

const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

const listingUrl = z.string().max(LISTING_URL_MAX).refine(isHttpUrl, 'must be an http:// or https:// URL')

// A path a manifest declares must name a file INSIDE the plugin's own package. The rule is the
// host's own module, copied byte-for-byte into manifest-entry-path.ts and pinned to the host by
// host-entry-path-parity.test.ts, so this schema refuses exactly the paths the host refuses.
// The messages are the host validator's, one per problem. Keyed by problem so a dimension the host
// adds fails tsc here instead of being reported with no message.
const ENTRY_PATH_MESSAGES: Record<Exclude<ManifestEntryPathProblem, 'not-a-string'>, string> = {
  blank: 'entryPoint must not be blank',
  'too-long': `entryPoint must be at most ${MANIFEST_ENTRY_PATH_MAX} characters`,
  'control-character': 'entryPoint must not contain a tab, newline or carriage return',
  scheme: 'entryPoint must be a plugin-relative path, not a URL or scheme',
  absolute: 'entryPoint must be relative to the plugin directory, not an absolute path',
  drive: 'entryPoint must be relative to the plugin directory, not a drive-qualified path',
  'parent-segment': 'entryPoint must not contain a ".." path segment',
}

const pluginRelativeEntryPath = z.string().superRefine((entryPath, ctx) => {
  for (const problem of manifestEntryPathProblems(entryPath)) {
    // `not-a-string` cannot reach here: z.string() has already refused a non-string.
    if (problem === 'not-a-string') continue
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: ENTRY_PATH_MESSAGES[problem] })
  }
})

const pluginInfoSchema = z.object({
  id: z.string().min(1).regex(pluginIdRegex, 'Plugin ID must be kebab-case (lowercase alphanumeric + hyphens)'),
  name: z.string().min(1).max(100),
  version: z.string().min(1),
  author: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  icon: z.string().min(1),
  category: z.enum(['planning', 'development', 'testing', 'devops', 'productivity', 'other']),
  license: z.object({ type: z.enum(['free', 'paid', 'trial']) }),
  minAppVersion: z.string().optional(),
  // Discoverability keywords surfaced in marketplace search + card chips.
  // Bounded (≤10 tags, ≤30 chars each) so a manifest can't flood search/UI.
  // Kept in sync with PluginManifest.plugin.tags and the AMC host validator.
  tags: z.array(z.string().min(1).max(30)).max(10).optional(),
  // Marketplace listing fields — bounds and host citations live at
  // LISTING_URL_MAX / SCREENSHOTS_MAX above.
  screenshots: z.array(listingUrl).max(SCREENSHOTS_MAX).optional(),
  links: z
    .object({
      homepage: listingUrl.optional(),
      support: listingUrl.optional(),
      privacy: listingUrl.optional(),
      contact: listingUrl.optional(),
      repository: listingUrl.optional(),
    })
    .optional(),
  requiresOrganization: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
})

const settingOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
})

const settingSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['toggle', 'select', 'text', 'number', 'password']),
  options: z.array(settingOptionSchema).optional(),
  optionsSource: z.enum(['ai-engines']).optional(),
  default: z.unknown(),
  min: z.number().optional(),
  max: z.number().optional(),
  // Host `z.boolean().optional()` (plugin-manifest-validator.ts, settings). Without
  // it a non-boolean passed here and failed at install, and a valid one was stripped.
  agentWritable: z.boolean().optional(),
})

/**
 * Columns the host manages itself and refuses to let a plugin declare — it
 * stamps `id`, `created_at` and `updated_at` on every row
 * (`types/plugins.ts:34-42`).
 *
 * The host enforces this in BOTH places, so this SDK does too: in a collection
 * schema (`plugin-manifest-validator.ts:167-172`) and in a migration operation
 * (`:206-212`). Rejecting them here means `amc-plugin validate` fails fast
 * instead of the plugin failing at install.
 */
const RESERVED_COLUMNS = ['id', 'created_at', 'updated_at']

const reservedColumnMessage = `column may not be one of ${RESERVED_COLUMNS.join(
  ', '
)} — the host manages these itself`

/**
 * Case-INSENSITIVE, matching the host (`isReservedPluginCollectionColumn`
 * lowercases before the lookup). SQLite column names are case-insensitive, so
 * `ID` genuinely collides with the host's own `id` and produces a
 * `duplicate column name` crash on a fresh database. A case-sensitive check here
 * let `ID`, `Created_At` and `UPDATED_AT` through `amc-plugin validate` and into
 * a failure the author only saw at install.
 */
const isReservedColumn = (name: string): boolean =>
  RESERVED_COLUMNS.includes(name.toLowerCase())

const collectionSchema = z
  .object({
    columns: z.record(sqlIdent(), z.enum(['text', 'integer', 'real', 'json'])),
    indexes: z.array(sqlIdent()).optional(),
    // Host-real and, until now, SDK-invisible: a non-strict parse silently
    // stripped this, so a packaged plugin could not rely on it. The host emits a
    // real CREATE UNIQUE INDEX per tuple, and `collectionUpsert`'s atomicity
    // depends on the tuple existing (plugin-storage.ts:511-513, :528-538).
    uniqueIndexes: z.array(z.array(sqlIdent()).min(1)).optional(),
    cliReadOnlyColumns: z.array(sqlIdent()).max(64).optional(),
    // Host `z.boolean().optional()` (plugin-manifest-validator.ts, storage.collections):
    // opts the table IN to control-server writes. See PluginCollectionSchema.agentWritable.
    agentWritable: z.boolean().optional(),
    // SDK-only: the ship check reads it, the host strips it. Same bounds as
    // isWrittenWaiver in ./command-tables.ts, so validate and the check agree.
    commandTableWaiver: z
      .string()
      .trim()
      .min(COMMAND_TABLE_WAIVER_MIN_CHARS, `must explain in at least ${COMMAND_TABLE_WAIVER_MIN_CHARS} characters why this table is safe`)
      .max(COMMAND_TABLE_WAIVER_MAX_CHARS)
      .optional(),
  })
  .superRefine((collection, ctx) => {
    for (const column of Object.keys(collection.columns)) {
      if (isReservedColumn(column)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['columns', column],
          message: reservedColumnMessage,
        })
      }
    }
    for (const name of collection.cliReadOnlyColumns ?? []) {
      if (!(name in collection.columns)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cliReadOnlyColumns'],
          message: `cliReadOnlyColumns names "${name}", which is not a declared column of this collection`,
        })
      }
    }
  })

// Mirrors the host's op enum exactly (plugin-manifest-validator.ts:199).
// `remove_column` / `remove_index` were SDK-only fictions the host has never
// accepted; they trace to a stale design plan. `drop_index` is the real name.
//
// Note this whole block is validated and then ignored — see the `migrations`
// doc comment in ../types/manifest.ts. The enum is still worth getting right so
// a manifest that validates here is one the host would also accept.
const migrationOperationSchema = z.object({
  type: z.enum(['add_column', 'add_index', 'drop_index']),
  collection: sqlIdent(),
  // Required for every op type, index ops included — the host has no
  // .optional() here (validator:201-212).
  column: sqlIdent().refine((name) => !isReservedColumn(name), {
    message: reservedColumnMessage,
  }),
  columnType: z.enum(['text', 'integer', 'real', 'json']).optional(),
  default: z.union([z.string(), z.number()]).optional(),
})

const migrationSchema = z.object({
  version: z.string().min(1),
  operations: z.array(migrationOperationSchema),
})

// `ui.windows` bounds, from the host's shared/types/plugins.ts (PLUGIN_WINDOWS_MAX,
// PLUGIN_WINDOW_KEY_MAX) and its validator's window schema.
const PLUGIN_WINDOWS_MAX = 4
const PLUGIN_WINDOW_KEY_MAX = 40
const PLUGIN_WINDOW_TITLE_MAX = 120
const PLUGIN_WINDOW_SIZE_MIN = 200
const PLUGIN_WINDOW_SIZE_MAX = 10000
const pluginWindowKeyRegex = /^[a-z0-9][a-z0-9-]*$/

// Every bound below is copied from the host validator
// (plugin-manifest-validator.ts, its `ui` block) so this SDK accepts exactly what the
// host does inside a `ui` block. A stricter SDK rejects manifests that install
// fine; a looser one lets `amc-plugin validate` pass something the host refuses.
//
// `entryPoint` and `sidebar` were REQUIRED here while the host has always had
// them optional, so a `ui` block carrying only `hideProjectPanel` validated
// host-side and failed here.
//
// One deliberate remaining gap, in the SDK-is-looser direction: the host
// requires the `ui` block itself, while we keep it optional — tightening that
// would reject the backend-only manifests this SDK has always accepted.
const uiSchema = z.object({
  entryPoint: pluginRelativeEntryPath.optional(),
  sidebar: z
    .object({
      title: z.string().min(1).max(50),
      icon: z.string().min(1).max(50),
    })
    .optional(),
  overlay: z
    .object({
      entryPoint: pluginRelativeEntryPath,
    })
    .optional(),
  // The three host surfaces below were missing here, so zod stripped them and
  // their entry paths were never checked: `amc-plugin validate` approved a
  // `ui.widget.entryPoint` of `../other-plugin/x.html` that the host refuses.
  settingsPanel: z.object({ entryPoint: pluginRelativeEntryPath }).optional(),
  widget: z.object({ entryPoint: pluginRelativeEntryPath }).optional(),
  windows: z
    .record(
      z.string().min(1).max(PLUGIN_WINDOW_KEY_MAX).regex(pluginWindowKeyRegex),
      z.object({
        entryPoint: pluginRelativeEntryPath,
        title: z.string().min(1).max(PLUGIN_WINDOW_TITLE_MAX).optional(),
        width: z.number().int().min(PLUGIN_WINDOW_SIZE_MIN).max(PLUGIN_WINDOW_SIZE_MAX).optional(),
        height: z.number().int().min(PLUGIN_WINDOW_SIZE_MIN).max(PLUGIN_WINDOW_SIZE_MAX).optional(),
      })
    )
    .refine(
      (windows) => Object.keys(windows).length <= PLUGIN_WINDOWS_MAX,
      `at most ${PLUGIN_WINDOWS_MAX} windows may be declared`
    )
    .optional(),
  hideProjectPanel: z.boolean().optional(),
  // The sibling opt-out. Host-real and host-validated (plugin-manifest-validator
  // ts, alongside hideProjectPanel), and it was absent here — so a full-width
  // manifest round-tripped through this non-strict schema kept hideProjectPanel
  // and SILENTLY LOST this one, un-full-widthing the plugin at package time
  // while a dev-loaded build looked right.
  hideSessionsPane: z.boolean().optional(),
  sessions: z
    .object({
      // max(5000) but deliberately NO min(1): the host accepts an empty
      // template and treats a whitespace-only one as absent at runtime
      // (plugin-provider.ts:229).
      contextTemplate: z.string().max(5000).optional(),
      label: z.string().min(1).max(100).optional(),
      showDivider: z.boolean().optional(),
      realProjectContext: z.boolean().optional(),
      suggestedPrompts: z
        .array(
          z.object({
            label: z.string().min(1).max(60),
            prompt: z.string().min(1).max(2000),
          })
        )
        .max(4)
        .optional(),
    })
    .optional(),
})

// The `ctx.workspace` manifest block. `args` may legitimately be EMPTY — the
// spec's own `generic.run` slot declares `"args": []` — so no `.min(1)` here.
// Duplicate slot names are not rejected: the host has no such rule to mirror,
// and inventing one is how this SDK's host mirror went wrong before.
const workspaceCommandSlotSchema = z.object({
  name: z.string().min(1),
  args: z.array(z.string()),
})

const workspaceSchema = z.object({
  binding: z.object({ granularity: z.literal('package') }).optional(),
  commandSlots: z.array(workspaceCommandSlotSchema).optional(),
})

// Every field mirrors the host (`plugin-manifest-validator.ts`, cli.endpoints).
// This block had drifted in three directions at once: it rejected PATCH, which
// the host and the marketplace both accept; it REQUIRED `description` and `auth`,
// which the host makes optional, so a legal manifest failed `amc-plugin validate`;
// and it had no `requiresConfirmation` at all.
const cliEndpointSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  path: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  auth: z.boolean().optional(),
  /**
   * Marks a destructive endpoint the HOST must gate behind a human inbox
   * approval before dispatching it.
   *
   * This is the one flag on the whole manifest that exists purely to make an
   * AI-callable endpoint safe, and the SDK had no type for it — so an author
   * working from SDK types could not mark an endpoint destructive even though
   * the host would have honoured it.
   */
  requiresConfirmation: z.boolean().optional(),
  safe: z.boolean().optional(),
  preview: z.enum(['two-step', 'card']).optional(),
  previewPath: z.string().min(1).max(200).optional(),
}).refine((e) => !(e.safe === true && e.requiresConfirmation === true), {
  message: 'an endpoint cannot be both "safe" and "requiresConfirmation"',
}).refine((e) => e.preview === undefined || e.requiresConfirmation === true, {
  message: 'an endpoint can only declare a "preview" together with "requiresConfirmation"',
})

type CliEndpointInput = z.infer<typeof cliEndpointSchema>

function previewPathProblem(
  endpoints: readonly CliEndpointInput[],
  endpoint: CliEndpointInput,
): string | undefined {
  if (endpoint.preview === undefined) {
    return endpoint.previewPath === undefined
      ? undefined
      : 'an endpoint can only declare a "previewPath" together with a "preview"'
  }
  if (endpoint.previewPath === undefined) {
    return 'an endpoint that declares a "preview" must also declare a "previewPath"'
  }
  if (endpoint.previewPath === endpoint.path) {
    return 'the "previewPath" cannot be the same as the endpoint path'
  }
  const target = endpoints.find((e) => e.method === endpoint.method && e.path === endpoint.previewPath)
  if (!target) {
    return `the "previewPath" must name another endpoint of this plugin with the same method (${endpoint.method} ${endpoint.previewPath} is not declared)`
  }
  return target.safe === true && target.requiresConfirmation !== true
    ? undefined
    : 'the "previewPath" endpoint must be declared "safe": true and must not require confirmation'
}

const cliEndpointsSchema = z
  .array(cliEndpointSchema)
  .max(200)
  .superRefine((endpoints, ctx) => {
    endpoints.forEach((endpoint, index) => {
      const message = previewPathProblem(endpoints, endpoint)
      if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'previewPath'], message })
    })
  })

const keybindingSchema = z.object({
  shortcut: z.string().min(1).max(100),
  commandId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9-]+$/),
  label: z.string().min(1).max(200),
})

const SAFE_COMMAND_NAME = /^[a-zA-Z0-9._+-]+$/
const SAFE_COMMAND_MESSAGE =
  'allowedCommands entries must be a bare command name (letters, digits, . _ + -) with no path separators, wildcards, whitespace, or shell characters'

const interpreterDenylist: ReadonlySet<string> = new Set(PROCESS_INTERPRETER_DENYLIST)

const normalizeCommandName = (raw: string): string =>
  (raw.split(/[\\/]/).pop() ?? raw).toLowerCase().replace(/\.exe$/i, '').replace(/\.cmd$/i, '')

const allowedCommandSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(SAFE_COMMAND_NAME, SAFE_COMMAND_MESSAGE)
  .refine(
    (entry) => !interpreterDenylist.has(normalizeCommandName(entry)),
    (entry) => ({
      message: `process.allowedCommands may not include the general-purpose interpreter "${normalizeCommandName(entry)}" — it would let the plugin run arbitrary code`,
    })
  )

const cronJobSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  schedule: z.string().min(1),
  description: z.string().min(1),
  approvalRequired: z.boolean(),
})

// No upper bound: the host has none, so the SDK's old `.max(512)` was invented
// policy that rejected a host-legal `memoryMb: 1024`.
const resourceLimitsSchema = z.object({
  memoryMb: z.number().int().positive().optional(),
})

const backendTimeoutMs = z.number().int().positive().optional()

const backendTimeoutsSchema = z.object({
  activateMs: backendTimeoutMs,
  onEnableMs: backendTimeoutMs,
  onDisableMs: backendTimeoutMs,
  onShutdownMs: backendTimeoutMs,
  onSettingsChangedMs: backendTimeoutMs,
  onAppReadyMs: backendTimeoutMs,
  cliDispatchMs: backendTimeoutMs,
})

export { PLUGIN_PERMISSIONS } from '../generated/sdk-facts.js'

const permissionSchema = z.enum(PLUGIN_PERMISSIONS)

const UPLOAD_HOST_MESSAGE =
  'uploadHosts entries must be one exact lowercase website name such as upload.example.com, with no scheme, port, path, wildcard or IP address'

const uploadHostSchema = z
  .string()
  .max(253)
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    UPLOAD_HOST_MESSAGE,
  )
  .refine((host) => !host.endsWith('.localhost'), { message: UPLOAD_HOST_MESSAGE })

/**
 * Four keys below (`settings`, `storage`, `migrations`, `sdkVersion`) were
 * REQUIRED here while the host defaults or omits every one of them. That is the
 * worst direction for a validator to drift in: it rejects manifests the host
 * installs happily. Measured against the host's own bundled plugins, SIX of its
 * twelve builtins failed `amc-plugin validate` — `writer` for `storage`,
 * `virtual-pets` for `storage` and `migrations`, and four more for `sdkVersion`
 * alone (the host reads an absent `sdkVersion` as "a v1 in-process plugin").
 *
 * They now match the host: defaulted where the host defaults, optional where the
 * host is optional, so the defaulted output shape an author gets back is
 * unchanged.
 */
export const manifestSchema = z.object({
  plugin: pluginInfoSchema,
  settings: z.array(settingSchema).default([]),
  storage: z
    .object({
      collections: z.record(sqlIdent(), collectionSchema),
      kv: z.object({ agentWritable: z.boolean().optional() }).optional(),
    })
    .default({ collections: {} }),
  migrations: z.array(migrationSchema).default([]),
  ui: uiSchema.optional(),
  keybindings: z.array(keybindingSchema).max(20).optional(),
  process: z.object({ allowedCommands: z.array(allowedCommandSchema).min(1).max(20) }).optional(),
  sdkVersion: z.string().min(1).max(50).optional(),
  backend: z.object({
    entryPoint: pluginRelativeEntryPath,
    resourceLimits: resourceLimitsSchema.optional(),
    timeouts: backendTimeoutsSchema.optional(),
  }).optional(),
  // `.max(50)` mirrors the host's cap on the array length.
  permissions: z.array(permissionSchema).max(50).optional(),
  cli: z.object({ endpoints: cliEndpointsSchema }).optional(),
  cron: z.object({ jobs: z.array(cronJobSchema) }).optional(),
  // Host-real (plugin-manifest-schema.ts): without it zod strips the one switch that gives a
  // plugin's sessions their built-in tools.
  sessionTools: z.boolean().optional(),
  workspace: workspaceSchema.optional(),
  uploadHosts: z.array(uploadHostSchema).min(1).max(10).optional(),
})
  .superRefine((manifest, ctx) => {
    if ((manifest.permissions ?? []).includes('network.upload') !== (manifest.uploadHosts?.length ?? 0) > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['uploadHosts'],
        message:
          '"network.upload" and "uploadHosts" go together: a plugin that uploads files must list the websites it uploads to, and a plugin that lists them must ask for network.upload',
      })
    }
    // The host REJECTS a manifest asking for workspace.write or workspace.exec
    // without an explicit workspace.read alongside it, and so does the
    // marketplace publish gate (`workspace_permission_pairing`). It deliberately
    // does NOT infer read from write: roughly twenty consumers read the raw
    // permissions array and the consent ledger, so an inferred permission would
    // make the consent card the user reads disagree with what the plugin holds.
    //
    // Without this rule `permissions: ["workspace.write"]` passed
    // `amc-plugin validate`, then failed BOTH the publish gate and the install.
    const permissions = manifest.permissions ?? []
    // `chrome.widget` draws in the titlebar, the highest-trust surface in the
    // app. The host requires an explicit `chrome` sibling for the same reason it
    // requires `workspace.read`: the consent card the user reads must match the
    // permissions array the plugin actually holds, so nothing is implied.
    if (permissions.includes('chrome.widget') && !permissions.includes('chrome')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['permissions'],
        message:
          '"chrome.widget" requires an explicit "chrome" permission in the same manifest: add chrome to permissions',
      })
    }
    if (permissions.includes('boards.link') && !permissions.includes('boards.read')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['permissions'],
        message:
          '"boards.link" requires an explicit "boards.read" permission in the same manifest: add boards.read to permissions',
      })
    }
    if (permissions.includes('workspace.read')) return
    for (const perm of ['workspace.write', 'workspace.exec'] as const) {
      if (permissions.includes(perm)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['permissions'],
          message: `"${perm}" requires an explicit "workspace.read" permission in the same manifest: add workspace.read to permissions`,
        })
      }
    }
  })

export interface ManifestValidationResult {
  valid: boolean
  errors: string[]
  manifest?: z.infer<typeof manifestSchema>
}

// The host's authorManifestProblems (shared/plugin-manifest-schema.ts). The host still LOADS such a
// manifest — its backend just never starts — so the rule belongs to authoring doors like this one,
// not to the schema.
const SDK_VERSION_REQUIRED_PROBLEM =
  'sdkVersion: Required - it selects the host worker loader, the only backend there is, so a manifest without it declares a backend that can never start'

function authorManifestProblems(input: unknown): string[] {
  if (typeof input !== 'object' || input === null) return []
  const manifest = input as Record<string, unknown>
  return manifest.backend && !manifest.sdkVersion ? [SDK_VERSION_REQUIRED_PROBLEM] : []
}

export function validateManifest(input: unknown): ManifestValidationResult {
  const result = manifestSchema.safeParse(input)
  const authorProblems = authorManifestProblems(input)
  if (result.success && authorProblems.length === 0) {
    return { valid: true, errors: [], manifest: result.data }
  }
  const schemaErrors = result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
  return { valid: false, errors: [...schemaErrors, ...authorProblems] }
}
