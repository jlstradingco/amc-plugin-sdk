export type {
  PluginLicenseType, PluginCategory, PluginSource, PluginCollectionColumnType,
  PluginCollectionSchema, PluginMigrationOperation, PluginMigration,
  PluginSettingOption, PluginSettingTestAction, PluginSettingDefinition,
  PluginSuggestedPrompt,
  PluginPermission, PluginCliEndpoint, PluginCronDefinition,
  PluginManifest, PluginRegistryEntry,
  // Workspace manifest block - see the workspace permissions
  PluginWorkspaceCommandSlot, PluginWorkspaceBinding, PluginWorkspace,
} from './manifest.js'

export type {
  QueryOptions, SidebarItem, CliRequest, CliResponse, CliHandler,
  PluginStorage, PluginSecrets, PluginDb, PluginSettings, PluginLogger, PluginEvents,
  PluginSessions, SessionStatus, SessionPendingAction, SessionMessage, PluginAi, PluginAiStructuredRequest, PluginFs, PluginHttp, PluginCron, PluginCli,
  PluginSidebar, PluginToast, PluginContext,
  PluginAuthUser, PluginAuthSession, PluginAuth, InboxItem, PluginInbox,
  RecordingHandle, Recording, PluginRecording,
  SynthesizedSpeech, PluginTts,
  HistoryProject, HistorySession, HistoryMessage, HistoryGrantResult, PluginSessionHistory,
  FirebaseAccount, FirebaseProject, FirebaseSetupStatus, PluginFirebase,
  SpendWindow, SpendEngineLine, SpendFeatureLine, SpendCharge, SpendReportBreakdown, PluginSpend,
  // Workspace - the workspace.read / .write / .exec capability
  WorktreeRef, WorktreeStatus, WorktreeInfo,
  WorkspaceScope, WorkspaceHandle, WorkspaceEntry, WorkspaceCheckout, WorkspaceGlobOpts,
  WorkspaceExecStatus, WorkspaceExecResults, WorkspaceBinding, WorkspaceBindingResult,
  WorkspaceApi,
} from './context.js'

export type { PluginBackend, PluginActivate } from './backend.js'
