import type { PluginStorage, PluginDb, PluginSettings, PluginSidebar, PluginToast, PluginAi, PluginInbox, PluginAuth, PluginRecording } from './context.js'

export interface BridgeTheme {
  get(): { mode: string; visualTheme: string }
  onChange(callback: (theme: { mode: string; visualTheme: string }) => void): () => void
}

export interface BridgeSession {
  create(opts: { prompt?: string }): Promise<{ sessionId: string }>
  sendMessage(sessionId: string, opts: { text: string }): Promise<void>
  getMessages(sessionId: string): Promise<unknown[]>
  getStatus(sessionId: string): Promise<string>
  rename(sessionId: string, name: string): Promise<void>
  stop(sessionId: string): Promise<void>
  launchWithDraft(opts: { projectId: string; draftText: string }): Promise<void>
}

export interface BridgeExport {
  saveFile(opts: { filename: string; content: string; type: string }): Promise<void>
  savePDF(opts: { filename: string; markdown: string; metadata?: Record<string, unknown> }): Promise<void>
  pickFolder(opts?: { defaultPath?: string; title?: string }): Promise<string>
  writeFiles(opts: { directory: string; files: { name: string; content: string }[] }): Promise<void>
  verifyFiles(opts: { directory: string; files: string[] }): Promise<void>
  openFolder(opts: { path: string }): Promise<void>
}

export interface BridgeProject {
  listAll(): Promise<unknown[]>
  findByFolder(folderPath: string): Promise<unknown | null>
  create(opts: { name: string; folderPath: string }): Promise<unknown>
  openAddDialog(opts: { preselectedFolder: string }): Promise<unknown>
}

export interface BridgeAssets {
  readFile(path: string): Promise<string>
  listFiles(path: string): Promise<string[]>
}

export interface AgentMC {
  storage: PluginStorage
  db: PluginDb
  settings: PluginSettings
  theme: BridgeTheme
  toast: PluginToast
  session: BridgeSession
  ai: PluginAi
  export: BridgeExport
  project: BridgeProject
  sidebar: PluginSidebar
  assets: BridgeAssets
  inbox: PluginInbox
  auth: PluginAuth
  recording: PluginRecording
}

declare global {
  interface Window {
    AgentMC: AgentMC
  }
}
