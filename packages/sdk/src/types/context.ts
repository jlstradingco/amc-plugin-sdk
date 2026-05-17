export interface QueryOptions {
  where?: Record<string, unknown>
  orderBy?: string
  order?: 'ASC' | 'DESC'
  limit?: number
  offset?: number
}

export interface SidebarItem {
  id: string
  title: string
  status?: string
  needsYou?: boolean
  progress?: number
  currentStep?: number
  totalSteps?: number
}

export interface CliRequest {
  method: string
  path: string
  body?: unknown
  query?: Record<string, string>
}

export interface CliResponse {
  status: number
  body?: unknown
}

export type CliHandler = (req: CliRequest) => Promise<CliResponse>

export interface PluginStorage {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  list(prefix?: string): Promise<{ key: string; value: unknown }[]>
}

export interface PluginDb {
  insert(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>>
  query(collection: string, options?: QueryOptions): Promise<Record<string, unknown>[]>
  getById(collection: string, id: string): Promise<Record<string, unknown> | null>
  update(collection: string, id: string, fields: Record<string, unknown>): Promise<Record<string, unknown>>
  delete(collection: string, id: string): Promise<void>
  deleteWhere(collection: string, where: Record<string, unknown>): Promise<void>
}

export interface PluginSettings {
  getAll(): Promise<Record<string, unknown>>
  get(key: string): Promise<unknown>
}

export interface PluginLogger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
}

export interface PluginEvents {
  emit(channel: string, data: unknown): void
  on(channel: string, handler: (data: unknown) => void): () => void
}

export interface PluginSessions {
  create(opts: { prompt?: string; projectId?: string }): Promise<{ sessionId: string }>
  sendMessage(sessionId: string, text: string): Promise<void>
  getStatus(sessionId: string): Promise<string>
  getMessages(sessionId: string): Promise<unknown[]>
  stop(sessionId: string): Promise<void>
  onStatusChange(sessionId: string, handler: (status: string) => void): () => void
}

export interface PluginAi {
  generateMessage(systemPrompt: string, userPrompt: string): Promise<string>
  generateTitle(text: string): Promise<string>
}

export interface PluginFs {
  readFile(relativePath: string): Promise<string>
  writeFile(relativePath: string, content: string): Promise<void>
  exists(relativePath: string): Promise<boolean>
  listDir(relativePath?: string): Promise<string[]>
  deleteFile(relativePath: string): Promise<void>
}

export interface PluginHttp {
  fetch(url: string, options?: RequestInit): Promise<Response>
}

export interface PluginCron {
  register(id: string, schedule: string, handler: () => Promise<void>): void
  unregister(id: string): void
  isRegistered(id: string): boolean
}

export interface PluginCli {
  handle(path: string, handler: CliHandler): void
  removeHandler(path: string): void
}

export interface PluginSidebar {
  setBadge(count: number): void
  setItems(items: SidebarItem[]): void
}

export interface PluginToast {
  show(opts: { type: 'success' | 'error' | 'info'; message: string }): void
  notify(opts: { title: string; body: string }): void
}

export interface PluginContext {
  pluginId: string
  pluginVersion: string
  dataDir: string
  storage: PluginStorage
  db: PluginDb
  settings: PluginSettings
  log: PluginLogger
  events: PluginEvents
  sessions: PluginSessions
  ai: PluginAi
  fs: PluginFs
  http: PluginHttp
  cron: PluginCron
  cli: PluginCli
  sidebar: PluginSidebar
  toast: PluginToast
}
