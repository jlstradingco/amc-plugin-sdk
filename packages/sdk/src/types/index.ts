export type {
  PluginLicenseType, PluginCategory, PluginSource, PluginCollectionColumnType,
  PluginCollectionSchema, PluginMigrationOperation, PluginMigration,
  PluginSettingOption, PluginSettingDefinition,
  PluginSuggestedPrompt,
  PluginPermission, PluginCliEndpoint, PluginCronDefinition,
  PluginManifest, PluginSupportLinks, PluginRegistryEntry, PluginRuntimeStatus,
  // Workspace manifest block (`workspace.read` / `.write` / `.exec`)
  PluginWorkspaceCommandSlot, PluginWorkspaceBinding, PluginWorkspace,
} from './manifest.js'

export type {
  QueryOptions, SidebarItem, CliRequest, CliResponse, CliHandler,
  PluginCliRequest, PluginCliResponse,
  PluginStorage, PluginSecrets, PluginDb, PluginDbRow, PluginDbQueryOptions,
  PluginStorageStats, PluginSettings, PluginLogger, PluginEvents,
  PluginSessions, SessionStatus, SessionPendingAction, SessionMessage, PluginAi, PluginAiStructuredRequest, PluginEngineCatalog, PluginFs, PluginHttp, PluginHttpInit, PluginHttpResponse, PluginCron, PluginCli,
  PluginSidebar, PluginToast, PluginContext, PluginRpc, PluginHost,
  PluginAuthUser, PluginAuthSession, PluginAuth, InboxItem, PluginInbox,
  RecordingStartResult, RecordingStopResult, Recording, PluginRecording,
  SynthesizedSpeech, PluginTts,
  HistoryProject, HistorySession, HistoryMessage, HistoryGrantResult, PluginSessionHistory,
  FirebaseAccount, FirebaseProject, FirebaseSetupStatus, PluginFirebase,
  SpendWindow, SpendEngineLine, SpendFeatureLine, SpendCharge, SpendReportBreakdown, PluginSpend,
  // Workspace (`workspace.read` / `.write` / `.exec`)
  WorktreeRef, WorktreeStatus, WorktreeInfo,
  WorkspaceScope, WorkspaceHandle, WorkspaceEntry, WorkspaceCheckout, WorkspaceGlobOpts,
  WorkspaceProjectRef, WorkspaceWriteFilesResult, WorkspaceExecResult, WorkspaceRunRequest,
  // The exec JOB path (`exec` / `execStatus` / `execResults` / `execCancel`)
  WorkspaceExecJobState, WorkspaceExecStartRequest, WorkspaceExecStartResult,
  WorkspaceExecJobStatus, WorkspaceExecPollRequest, WorkspaceExecPollResponse,
  WorkspaceApi,
} from './context.js'

export type { PluginBackend, PluginActivate } from './backend.js'
