export type PluginLicenseType = 'free' | 'paid' | 'trial'

export type PluginCategory =
  | 'planning'
  | 'development'
  | 'testing'
  | 'devops'
  | 'productivity'
  | 'other'

/** `'dev'` is a Developer-Mode load-unpacked folder — a real host source the SDK
 *  omitted, so a consumer switching on this union hit an unhandled variant. */
export type PluginSource = 'builtin' | 'marketplace' | 'dev'

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
   * This is not decoration: `ctx.db.upsert()` performs an
   * `INSERT ... ON CONFLICT (<tuple>) DO UPDATE`, so a tuple declared here is
   * what makes that call atomic. An upsert against an undeclared tuple raises a
   * SQLite error rather than silently inserting a duplicate.
   */
  uniqueIndexes?: string[][]
  /**
   * Opt this table IN to writes from Omniscio's local control server — the
   * `POST` / `PATCH` / `DELETE /plugins/:id/db/:collection` routes every AI agent
   * session on the computer can reach. Absent or `false` (the default), the host
   * refuses every such write with a 403 for every key, so an agent cannot insert,
   * edit or re-arm your rows. Your own backend and panel still write normally.
   *
   * Set it only on plain data an agent may freely edit, never on a table your
   * plugin acts on (a command queue, a job list, a rule it runs).
   *
   * Hosts that predate the plugin-table fence strip the key and keep the old open
   * door, so never rely on it for safety there — see the command channel guide.
   * Mirrors the host's `PluginCollectionSchema.agentWritable`
   * (plugin-command-trust-contract.md).
   */
  agentWritable?: boolean
  /**
   * A written reason why this table is safe even though `amc-plugin validate`
   * flags it as a command table (an instruction column, an argument column and a
   * status column). 20 to 500 characters. The CLI's ship check and marketplace
   * review read it; the host strips it. A waiver never covers an `agentWritable`
   * table.
   */
  commandTableWaiver?: string
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

/**
 * One named command slot. The plugin declares slots; the USER binds a base
 * command per (project, package); the host appends these args and spawns with
 * `shell: false`.
 *
 * `args` is deliberately **manifest-static** — there is no runtime `{args}`
 * placeholder. That is what makes every flag the plugin can ever pass visible
 * at marketplace review, and it is why command injection is closed by
 * construction: there is no plugin-supplied string to inject into.
 *
 * Placeholders are substituted host-side, single-pass, into an argv ARRAY —
 * never concatenated into a shell string. A list-valued variable expands to N
 * argv entries, or zero when the list is empty. `{reporter}` and
 * `{reporterConfig}` are host-reserved and host-minted; `{outFile}` is reserved
 * too and does NOT belong in `args` at all — the results path travels to the
 * child as an environment variable so it never appears in argv.
 *
 * The SDK does not police placeholder names: the host is the enforcement point
 * and has no such rule yet, so validating one here would invent policy.
 */
export interface PluginWorkspaceCommandSlot {
  name: string
  args: string[]
}

/**
 * How the user's command bindings are keyed.
 *
 * A single-member union on purpose — `'package'` is the only granularity the
 * capability spec defines, and the binding table is keyed
 * `(plugin_id, project_id, package_path)` to match. Adding a member later is
 * additive and non-breaking; inventing one now would not be.
 */
export interface PluginWorkspaceBinding {
  granularity: 'package'
}

/**
 * Manifest declaration for the `ctx.workspace` capability.
 *
 * > **The host never reads this.** `ctx.workspace` shipped, but WITHOUT a
 * > manifest surface: there is no `workspace` key in the host's manifest schema,
 * > and `commandSlots` / `binding` appear nowhere in the host at all. Zod strips
 * > unknown keys, so this block is silently discarded at parse time.
 *
 * The host chose a different mechanism than the one these types were
 * transcribed from. `ctx.workspace.run({ scope, command, args })` takes the
 * command and argv from the plugin DIRECTLY at call time — there are no
 * manifest-static command slots to declare, and no binding table. Injection is
 * closed by `shell: false`, a filtered PATH and a native confirm instead.
 *
 * Retained only so existing manifests keep validating.
 */
export interface PluginWorkspace {
  binding?: PluginWorkspaceBinding
  commandSlots?: PluginWorkspaceCommandSlot[]
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
  /**
   * Let a control-server write (`PATCH /plugins/:id/settings`) change this setting
   * at once. Absent or `false` (the default), such a write waits for the person's
   * approval card; a `password` setting is refused outright either way. The
   * in-app settings screen is unaffected. Hosts that predate the plugin-table
   * fence strip the key. Mirrors the host's `PluginSettingDefinition.agentWritable`.
   */
  agentWritable?: boolean
}

export type PluginPermission =
  | 'storage'
  | 'secrets'
  | 'sessions'
  | 'sessions.readHistory'
  | 'ai'
  | 'tts'
  | 'stt'
  | 'microphone'
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
  // Read the full contents of the boards the user grants the plugin — every item,
  // column value and status — through the webview's `AgentMC.boards` namespace
  // (`list`, `requestAccess`). The namespace itself is not typed by this SDK yet.
  | 'boards.read'
  // Workspace — read/write/exec against the user's real project checkouts and
  // worktrees, gated per project by a runtime grant on top of the install-time
  // permission. All three are live host-side (see `WorkspaceApi`).
  //
  // `workspace.write` does NOT imply `workspace.read`, despite what this comment
  // claimed: the host rejects a manifest declaring write or exec without an
  // explicit read alongside it, rather than inferring one, so that the consent
  // card the user reads matches the array the plugin actually holds. The
  // validator enforces the same pairing.
  | 'workspace.read'
  | 'workspace.write'
  | 'workspace.exec'

export interface PluginCliEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  /** Optional host-side, though worth writing — it is what a caller sees. */
  description?: string
  auth?: boolean
  /**
   * Marks a destructive endpoint the host must gate behind a human inbox
   * approval before dispatching it. The SDK had no type for this, so an author
   * could not mark an endpoint destructive even though the host honours it.
   */
  requiresConfirmation?: boolean
}

/**
 * One declared cron job.
 *
 * > **The host never reads this.** There is no `cron` key anywhere in the host's
 * > manifest schema or its `PluginManifest`, and zod strips unknown keys, so a
 * > declared `cron` block is silently discarded at parse time and reaches
 * > nothing. It validates, it packages, and then it does not exist.
 *
 * Cron is a RUNTIME capability: register jobs from your backend with
 * `ctx.cron.register(id, schedule, handler)` and declare the `cron` permission.
 * That path works. This block is retained only so existing manifests keep
 * validating.
 */
export interface PluginCronDefinition {
  id: string
  label: string
  schedule: string
  description: string
  approvalRequired: boolean
}

/**
 * Optional support/homepage links shown on the marketplace detail page's
 * Support tab. Every value must be an http:// or https:// URL — the host
 * opens them with `shell.openExternal`.
 */
export interface PluginSupportLinks {
  homepage?: string
  support?: string
  privacy?: string
  contact?: string
  repository?: string
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
    /**
     * Gallery images for the marketplace detail page: up to 8 developer-hosted
     * `http:`/`https:` URLs of at most 2048 characters each. Anything else fails
     * validation. Mirrors the host validator bounds (plugin-manifest-validator.ts
     * PLUGIN_SCREENSHOTS_MAX / PLUGIN_SCREENSHOT_URL_MAX).
     */
    screenshots?: string[]
    /**
     * Support/homepage links rendered on the marketplace detail page's Support
     * tab. Every value must be an `http:`/`https:` URL — see {@link PluginSupportLinks}.
     */
    links?: PluginSupportLinks
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
    /**
     * The plugin's own settings screen, opened from a "Settings" button on its
     * card in Settings -> Plugins. Additive: the `settings` array still renders.
     */
    settingsPanel?: { entryPoint: string }
    /**
     * The popover the host opens when its app-header widget is clicked. Without
     * it, clicking the widget opens the plugin's sidebar panel instead.
     */
    widget?: { entryPoint: string }
    /**
     * Pop-out surfaces the plugin may open in their own OS window, keyed by the
     * name it passes to `window.open(key)`. At most 4; keys are lowercase
     * letters, digits and hyphens (up to 40 characters); width and height are
     * 200-10000 px.
     */
    windows?: Record<string, { entryPoint: string; title?: string; width?: number; height?: number }>
    /** Hide AMC's project panel while this plugin's view is open, for a plugin that owns the full width. */
    hideProjectPanel?: boolean
    /**
     * The SIBLING opt-out, for the other owner of the same column. Set it
     * ALONGSIDE `hideProjectPanel` when your plugin owns its full width:
     * declining either one alone just hands the pane to the other surface, so
     * "full width" is these two booleans together, not one flag.
     */
    hideSessionsPane?: boolean
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
  /**
   * The Omniscio plugin-SDK contract this plugin needs — not the version of
   * this package. Write it bare (`"2.0.0"`): the host reads a bare version as a
   * minimum, "this contract or newer", while a caret range such as `"^3.0.0"`
   * is "this major only" and gets the plugin marked incompatible and hidden
   * whenever the host's contract major differs.
   *
   * Optional, matching the host — an absent `sdkVersion` is read as "a v1
   * in-process plugin", which is why four of the host's own builtins ship
   * without one. This was required here and rejected them.
   */
  sdkVersion?: string
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
  /**
   * Declaration for the `ctx.workspace` capability. Requires one or more of the
   * `workspace.*` permissions.
   *
   * NOT YET IMPLEMENTED BY THE HOST — see the `workspace.*` members of
   * {@link PluginPermission}.
   */
  workspace?: PluginWorkspace
}

/** Runtime state of a plugin's backend worker. */
export type PluginRuntimeStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'errored'
  | 'crashed'

export interface PluginRegistryEntry {
  id: string
  manifest: PluginManifest
  source: PluginSource
  enabled: boolean
  compatible: boolean
  /** Why `compatible` is false — e.g. an sdkVersion the host cannot satisfy. */
  incompatibleReason?: string
  installedVersion: string
  basePath: string
  storageInitialized: boolean
  /** True when an update added permissions the user has not granted yet. */
  needsReconsent?: boolean
  runtimeStatus?: PluginRuntimeStatus
  /** Last backend error, when `runtimeStatus` is `'errored'` or `'crashed'`. */
  lastError?: string
  // NOTE: no `backendPath`. It was declared here and the host never populates
  // it on a registry entry — the only real occurrences are a local variable in
  // the worker host and an env var passed to the child, neither of which
  // reaches this shape. It read as `undefined` every time.
}
