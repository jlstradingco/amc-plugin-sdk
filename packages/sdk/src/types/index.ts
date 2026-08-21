export type {
  PluginLicenseType, PluginCategory, PluginSource, PluginCollectionColumnType,
  PluginCollectionSchema, PluginMigrationOperation, PluginMigration,
  PluginSettingOption, PluginSettingTestAction, PluginSettingDefinition,
  PluginSuggestedPrompt,
  PluginPermission, PluginCliEndpoint, PluginCronDefinition,
  PluginManifest, PluginRegistryEntry, PluginRuntimeStatus,
  // Workspace manifest block (`workspace.read` / `.write` / `.exec`)
  PluginWorkspaceCommandSlot, PluginWorkspaceBinding, PluginWorkspace,
} from './manifest.js'

export type {
  QueryOptions, SidebarItem, CliRequest, CliResponse, CliHandler,
  PluginStorage, PluginSecrets, PluginDb, PluginStorageStats, PluginSettings, PluginLogger, PluginEvents,
  PluginSessions, SessionStatus, SessionPendingAction, SessionMessage, PluginAi, PluginAiStructuredRequest, PluginFs, PluginHttp, PluginCron, PluginCli,
  PluginSidebar, PluginToast, PluginContext,
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
