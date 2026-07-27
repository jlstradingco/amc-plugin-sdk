export type PluginLicenseType = 'free' | 'paid' | 'trial'

export type PluginCategory =
  | 'planning'
  | 'development'
  | 'testing'
  | 'devops'
  | 'productivity'
  | 'other'

export type PluginSource = 'builtin' | 'marketplace'

export type PluginCollectionColumnType = 'text' | 'integer' | 'real' | 'json'

export interface PluginCollectionSchema {
  columns: Record<string, PluginCollectionColumnType>
  indexes?: string[]
}

export interface PluginMigrationOperation {
  type: 'add_column' | 'remove_column' | 'add_index' | 'remove_index'
  collection: string
  column?: string
  columnType?: PluginCollectionColumnType
  index?: string
}

export interface PluginMigration {
  version: string
  operations: PluginMigrationOperation[]
}

export interface PluginSettingOption {
  value: string
  label: string
}

export interface PluginSettingTestAction {
  namespace: string
  method: string
  label: string
}

export interface PluginSettingDefinition {
  key: string
  label: string
  description?: string
  type: 'toggle' | 'select' | 'text' | 'number' | 'password'
  options?: PluginSettingOption[]
  default: unknown
  min?: number
  max?: number
  testAction?: PluginSettingTestAction
}

export type PluginPermission =
  | 'storage'
  | 'sessions'
  | 'sessions.readHistory'
  | 'ai'
  | 'tts'
  | 'network'
  | 'cron'
  | 'cli'
  | 'notifications'
  | 'system'
  | 'rss'
  | 'auth'
  | 'auth.session'
  | 'chrome'
  | 'firebase'
  | 'recording'
  | 'inbox'
  | 'navigation'
  | 'spend'

export interface PluginCliEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  description: string
  auth: boolean
}

export interface PluginCronDefinition {
  id: string
  label: string
  schedule: string
  description: string
  approvalRequired: boolean
}

export interface PluginManifest {
  plugin: {
    id: string
    name: string
    version: string
    author: string
    description: string
    icon: string
    category: PluginCategory
    license: { type: PluginLicenseType }
    minAppVersion?: string
    // Free-form discoverability keywords. Folded into the marketplace's text
    // search and rendered as chips on the plugin card. Bounded by the validator
    // (up to 10 tags, 30 chars each) so a manifest can't flood search or the UI.
    tags?: string[]
  }
  settings: PluginSettingDefinition[]
  storage: {
    collections: Record<string, PluginCollectionSchema>
  }
  migrations: PluginMigration[]
  ui?: {
    entryPoint: string
    sidebar: { title: string; icon: string }
  }
  sdkVersion: string
  backend?: {
    entryPoint: string
    resourceLimits?: {
      memoryMb?: number
    }
  }
  permissions?: PluginPermission[]
  cli?: {
    endpoints: PluginCliEndpoint[]
  }
  cron?: {
    jobs: PluginCronDefinition[]
  }
}

export interface PluginRegistryEntry {
  id: string
  manifest: PluginManifest
  source: PluginSource
  enabled: boolean
  compatible: boolean
  installedVersion: string
  basePath: string
  storageInitialized: boolean
  backendPath?: string
}
