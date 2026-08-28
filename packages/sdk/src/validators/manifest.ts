import { z } from 'zod'
import type { PluginPermission } from '../types/manifest.js'

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
})

const settingOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
})

const testActionSchema = z.object({
  namespace: z.string(),
  method: z.string(),
  label: z.string(),
})

const settingSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['toggle', 'select', 'text', 'number', 'password']),
  options: z.array(settingOptionSchema).optional(),
  default: z.unknown(),
  min: z.number().optional(),
  max: z.number().optional(),
  testAction: testActionSchema.optional(),
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

// Every bound below is copied from the host validator
// (plugin-manifest-validator.ts:220-265) so this SDK accepts exactly what the
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
  entryPoint: z.string().min(1).max(500).optional(),
  sidebar: z
    .object({
      title: z.string().min(1).max(50),
      icon: z.string().min(1).max(50),
    })
    .optional(),
  overlay: z
    .object({
      entryPoint: z.string().min(1).max(500),
    })
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
})

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

/**
 * Canonical, runtime-visible list of every permission a plugin can request.
 * Single source of truth: the Zod enum below is derived from it, and the two
 * `satisfies`/exhaustiveness guards keep it byte-for-byte in sync with the
 * `PluginPermission` union in ../types/manifest.ts. The SDK<->host parity guard
 * (src/__tests__/host-permission-parity.test.ts) compares this to the vendored
 * host mirror so the two surfaces cannot silently drift.
 */
export const PLUGIN_PERMISSIONS = [
  'storage',
  'secrets',
  'sessions',
  'sessions.readHistory',
  'ai',
  'tts',
  'stt',
  'microphone',
  'network',
  'cron',
  'cli',
  'notifications',
  'system',
  'rss',
  'auth',
  'auth.session',
  'chrome',
  'firebase',
  'recording',
  'inbox',
  'navigation',
  'spend',
  // All three are gated by the host and consented in its dialog; write and exec
  // gate real mutating methods. The pairing rule below requires an explicit
  // `workspace.read` alongside either of the other two.
  'workspace.read',
  'workspace.write',
  'workspace.exec',
] as const satisfies readonly PluginPermission[]

// Compile-time completeness: fails to type-check if a PluginPermission is added
// to the union but not listed above (the `satisfies` clause guards the reverse).
type _AssertAllPermissionsListed =
  PluginPermission extends (typeof PLUGIN_PERMISSIONS)[number] ? true : never
const _permissionExhaustiveness: _AssertAllPermissionsListed = true
void _permissionExhaustiveness

const permissionSchema = z.enum(PLUGIN_PERMISSIONS)

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
    })
    .default({ collections: {} }),
  migrations: z.array(migrationSchema).default([]),
  ui: uiSchema.optional(),
  sdkVersion: z.string().min(1).max(50).optional(),
  backend: z.object({
    entryPoint: z.string().min(1).max(500),
    resourceLimits: resourceLimitsSchema.optional(),
  }).optional(),
  // `.max(50)` mirrors the host's cap on the array length.
  permissions: z.array(permissionSchema).max(50).optional(),
  cli: z.object({ endpoints: z.array(cliEndpointSchema).max(200) }).optional(),
  cron: z.object({ jobs: z.array(cronJobSchema) }).optional(),
  workspace: workspaceSchema.optional(),
})
  .superRefine((manifest, ctx) => {
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

export function validateManifest(input: unknown): ManifestValidationResult {
  const result = manifestSchema.safeParse(input)
  if (result.success) {
    return { valid: true, errors: [], manifest: result.data }
  }
  const errors = result.error.issues.map(
    (issue) => `${issue.path.join('.')}: ${issue.message}`
  )
  return { valid: false, errors }
}
