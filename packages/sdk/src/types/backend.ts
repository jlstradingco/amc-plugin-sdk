import type { PluginContext } from './context'

export interface PluginBackend {
  onEnable?(): Promise<void> | void
  onDisable?(): Promise<void> | void
  onSettingsChanged?(settings: Record<string, unknown>): Promise<void> | void
  onAppReady?(): Promise<void> | void
  onShutdown?(): Promise<void> | void
}

export type PluginActivate = (ctx: PluginContext) => PluginBackend | Promise<PluginBackend>
