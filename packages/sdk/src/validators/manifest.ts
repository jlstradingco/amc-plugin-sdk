import { z } from 'zod'

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

const collectionSchema = z.object({
  columns: z.record(z.enum(['text', 'integer', 'real', 'json'])),
  indexes: z.array(z.string()).optional(),
})

const migrationOperationSchema = z.object({
  type: z.enum(['add_column', 'remove_column', 'add_index', 'remove_index']),
  collection: z.string(),
  column: z.string().optional(),
  columnType: z.enum(['text', 'integer', 'real', 'json']).optional(),
  index: z.string().optional(),
})

const migrationSchema = z.object({
  version: z.string(),
  operations: z.array(migrationOperationSchema),
})

const uiSchema = z.object({
  entryPoint: z.string().min(1),
  sidebar: z.object({
    title: z.string().min(1),
    icon: z.string().min(1),
  }),
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

const permissionSchema = z.enum([
  'storage', 'sessions', 'ai', 'network', 'cron', 'cli', 'notifications',
  'rss', 'auth', 'auth.session', 'recording', 'inbox', 'navigation',
])

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
