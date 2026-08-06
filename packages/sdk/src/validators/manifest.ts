import { z } from 'zod'
import type { PluginPermission } from '../types/manifest.js'

const pluginIdRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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
 * Columns the host owns — `types/plugins.ts:34-42`. Rejecting them here means
 * `amc-plugin validate` fails fast instead of the plugin failing at install.
 *
 * KNOWN GAP: the host refuses these in BOTH a collection schema
 * (`plugin-manifest-validator.ts:167-172`) and a migration operation (`:206-212`).
 * This list is currently applied to migration operations only, so a manifest
 * declaring `columns: { id: 'text' }` still passes here and fails host-side.
 * Closing that is a validation-behaviour change — manifests accepted today would
 * start being rejected — so it is deliberately not bundled into this one.
 */
const RESERVED_COLUMNS = ['id', 'created_at', 'updated_at']

const collectionSchema = z.object({
  columns: z.record(z.enum(['text', 'integer', 'real', 'json'])),
  indexes: z.array(z.string()).optional(),
  // Host-real and, until now, SDK-invisible: a non-strict parse silently
  // stripped this, so a packaged plugin could not rely on it. The host emits a
  // real CREATE UNIQUE INDEX per tuple, and `collectionUpsert`'s atomicity
  // depends on the tuple existing (plugin-storage.ts:511-513, :528-538).
  uniqueIndexes: z.array(z.array(z.string()).min(1)).optional(),
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
  collection: z.string(),
  // Required for every op type, index ops included — the host has no
  // .optional() here (validator:201-212).
  column: z.string().refine((name) => !RESERVED_COLUMNS.includes(name), {
    message: `column may not be one of ${RESERVED_COLUMNS.join(', ')} (the host owns these)`,
  }),
  columnType: z.enum(['text', 'integer', 'real', 'json']).optional(),
  default: z.union([z.string(), z.number()]).optional(),
})

const migrationSchema = z.object({
  version: z.string(),
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

const cliEndpointSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  path: z.string().min(1),
  description: z.string().min(1),
  auth: z.boolean(),
})

const cronJobSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  schedule: z.string().min(1),
  description: z.string().min(1),
  approvalRequired: z.boolean(),
})

const resourceLimitsSchema = z.object({
  memoryMb: z.number().int().positive().max(512).optional(),
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
] as const satisfies readonly PluginPermission[]

// Compile-time completeness: fails to type-check if a PluginPermission is added
// to the union but not listed above (the `satisfies` clause guards the reverse).
type _AssertAllPermissionsListed =
  PluginPermission extends (typeof PLUGIN_PERMISSIONS)[number] ? true : never
const _permissionExhaustiveness: _AssertAllPermissionsListed = true
void _permissionExhaustiveness

const permissionSchema = z.enum(PLUGIN_PERMISSIONS)

export const manifestSchema = z.object({
  plugin: pluginInfoSchema,
  settings: z.array(settingSchema),
  storage: z.object({
    collections: z.record(collectionSchema),
  }),
  migrations: z.array(migrationSchema),
  ui: uiSchema.optional(),
  sdkVersion: z.string().min(1),
  backend: z.object({
    entryPoint: z.string().min(1),
    resourceLimits: resourceLimitsSchema.optional(),
  }).optional(),
  permissions: z.array(permissionSchema).optional(),
  cli: z.object({ endpoints: z.array(cliEndpointSchema) }).optional(),
  cron: z.object({ jobs: z.array(cronJobSchema) }).optional(),
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
