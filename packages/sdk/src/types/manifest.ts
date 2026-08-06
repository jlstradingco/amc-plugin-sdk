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
  /** Single-column, non-unique indexes. The host emits `idx_<table>_<column>` for each. */
  indexes?: string[]
  /**
   * Composite-UNIQUE tuples: each inner array is a set of columns that together
   * must be unique. The host emits `CREATE UNIQUE INDEX IF NOT EXISTS
   * uidx_<table>_<col1>_<col2>` per tuple, de-duplicating existing rows
   * (keep-latest) the first time it creates one.
   *
   * This is not decoration: `collectionUpsert` performs an
   * `INSERT ... ON CONFLICT (<tuple>) DO UPDATE`, so a tuple declared here is
   * what makes that call atomic. An upsert against an undeclared tuple raises a
   * SQLite error rather than silently inserting a duplicate.
   */
  uniqueIndexes?: string[][]
}

/**
 * One operation inside a declared migration.
 *
 * **These names are the host's, exactly.** `remove_column` and `remove_index`
 * were SDK-only fictions the host has never accepted — they trace to a stale
 * design plan, and the shipped host renamed `remove_index` to `drop_index` and
 * dropped `remove_column` entirely.
 *
 * See {@link PluginMigration} for the much larger caveat: none of this runs.
 */
export interface PluginMigrationOperation {
  type: 'add_column' | 'add_index' | 'drop_index'
  collection: string
  /**
   * Required for EVERY operation type, including the index ops — the host
   * schema has no `.optional()` on it, so an index operation identifies its
   * index solely by a single column. There is no `index` / `indexName` field.
   */
  column: string
  columnType?: PluginCollectionColumnType
  /** `z.union([z.string(), z.number()])` host-side — `plugin-manifest-validator.ts:193-219`. */
  default?: string | number
}

/**
 * A declared schema migration.
 *
 * > **The host never executes these.** They are parsed, type-checked, retained
 * > on the plugin's registry entry — and then read by nothing. There is no
 * > migration runner, no applied-migrations ledger, and no code path that can
 * > drop a plugin column or index.
 *
 * What actually evolves your schema is an automatic **ADD COLUMN sweep**: when
 * your plugin's version increases, the host diffs `storage.collections` against
 * the live table and adds any missing columns. So a new column appears if you
 * declare it in `storage.collections` and bump your version — whether or not
 * you write a migration here. Renames and drops are not possible through any
 * host path.
 *
 * Declaring migrations remains harmless and validates, so existing manifests
 * keep working; just do not expect them to do anything.
 */
export interface PluginMigration {
  version: string
  operations: PluginMigrationOperation[]
}

/** One tappable prompt under a plugin's session list. The host renders at most four. */
export interface PluginSuggestedPrompt {
  label: string
  prompt: string
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
  | 'secrets'
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
  /**
   * Kept optional here even though the host requires the block, so this SDK
   * keeps accepting the backend-only manifests it has always accepted. That is
   * a deliberate SDK-is-looser gap: it can let `amc-plugin validate` pass
   * something the host rejects, but it can never block a legal manifest.
   */
  ui?: {
    /** Optional, matching the host — a `ui` block is useful for its side effects alone. */
    entryPoint?: string
    sidebar?: { title: string; icon: string }
    /** A separate always-on-top window. The host opens it on enable. */
    overlay?: { entryPoint: string }
    /** Hide AMC's project panel while this plugin's view is open, for a plugin that owns the full width. */
    hideProjectPanel?: boolean
    /** Customises the session list AMC renders for this plugin's own virtual project. */
    sessions?: {
      /**
       * Extra context appended to the host's built-in primer for every session
       * on this plugin's project. Supports single-pass `{{placeholder}}`
       * substitution — `date`, `projectName`, `sessionName`, `workDir` and
       * `pluginName` are always available.
       *
       * A whitespace-only template is treated as absent rather than rejected.
       */
      contextTemplate?: string
      /** Heading above the plugin's session list. Defaults to the plugin's name. */
      label?: string
      /** Defaults to true host-side. */
      showDivider?: boolean
      suggestedPrompts?: PluginSuggestedPrompt[]
    }
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
