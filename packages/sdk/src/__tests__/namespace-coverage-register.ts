export interface UntypedBridgeNamespace {
  namespace: string
  reason: string
}

export const UNTYPED_BRIDGE_GAPS: readonly UntypedBridgeNamespace[] = [
  { namespace: 'autohotkey', reason: 'AutoHotkey script control — no AgentMC type yet' },
  { namespace: 'boardLinks', reason: 'Board-to-session linking — no AgentMC type yet' },
  { namespace: 'boards', reason: 'Board read and access requests — no AgentMC type yet' },
  { namespace: 'books', reason: 'Book and chapter content — no AgentMC type yet' },
  { namespace: 'clipboard', reason: 'Clipboard read and write — no AgentMC type yet' },
  { namespace: 'commands', reason: 'Command palette contributions — no AgentMC type yet' },
  { namespace: 'cron', reason: 'Scheduled job control from the webview — no AgentMC type yet' },
  { namespace: 'decks', reason: 'Deck and slide assembly — no AgentMC type yet' },
  { namespace: 'flashcards', reason: 'Card packs and review sessions — no AgentMC type yet' },
  { namespace: 'fs', reason: 'File reads and writes from the webview — no AgentMC type yet' },
  { namespace: 'http', reason: 'Outbound HTTP from the webview — no AgentMC type yet' },
  { namespace: 'keybindings', reason: 'Shortcut registration — no AgentMC type yet' },
  { namespace: 'lms', reason: 'Course and lesson administration — no AgentMC type yet' },
  { namespace: 'members', reason: 'Workspace member reads (declaration only) — no AgentMC type yet' },
  { namespace: 'navigation', reason: 'In-app navigation and deep links — no AgentMC type yet' },
  { namespace: 'nightytidy2', reason: 'Nightly tidy controls — no AgentMC type yet' },
  { namespace: 'notifications', reason: 'Notification delivery — no AgentMC type yet' },
  { namespace: 'overlay', reason: 'Overlay panel surface — no AgentMC type yet' },
  { namespace: 'process', reason: 'Allow-listed process spawning — no AgentMC type yet' },
  { namespace: 'rpc', reason: 'Panel-to-backend request channel — no AgentMC type yet' },
  { namespace: 'runs', reason: 'Run inspection and cancellation — no AgentMC type yet' },
  { namespace: 'runtime', reason: 'Runtime version and introspection — no AgentMC type yet' },
  { namespace: 'scan', reason: 'Security scanning — no AgentMC type yet' },
  { namespace: 'secrets', reason: 'Encrypted credential storage — no AgentMC type yet' },
  { namespace: 'share', reason: 'Publishing artifacts to Shares — no AgentMC type yet' },
  { namespace: 'shell', reason: 'External shell open and reveal — no AgentMC type yet' },
  { namespace: 'tray', reason: 'Tray menu contributions — no AgentMC type yet' },
  { namespace: 'writer', reason: 'Document editing — no AgentMC type yet' }
]
