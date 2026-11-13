export interface PublishedMethodGap {
  surface: 'backend' | 'webview'
  namespace: string
  generatedOnly: readonly string[]
  publishedOnly: readonly string[]
  reason: string
}

export const PUBLISHED_METHOD_GAPS: readonly PublishedMethodGap[] = [
  {
    surface: 'backend',
    namespace: 'email',
    generatedOnly: [],
    publishedOnly: ['sender'],
    reason: "The backend context builds email.sender, but the worker proxy forwards only the five send-schedule actions, so the generated sheet omits it"
  },
  {
    surface: 'webview',
    namespace: 'documents',
    generatedOnly: ['forget', 'grants', 'reopen'],
    publishedOnly: [],
    reason: 'The published BridgeDocuments declares only the picker half of the documents namespace'
  }
]

export interface UntypedBridgeNamespace {
  namespace: string
  reason: string
}

export const UNTYPED_BRIDGE_GAPS: readonly UntypedBridgeNamespace[] = [
  { namespace: 'autohotkey', reason: 'AutoHotkey script control — no AgentMC type yet' },
  { namespace: 'books', reason: 'Book and chapter content — no AgentMC type yet' },
  { namespace: 'commands', reason: 'Command palette contributions — no AgentMC type yet' },
  { namespace: 'cron', reason: 'Scheduled job control from the webview — no AgentMC type yet' },
  { namespace: 'decks', reason: 'Deck and slide assembly — no AgentMC type yet' },
  { namespace: 'flashcards', reason: 'Card packs and review sessions — no AgentMC type yet' },
  { namespace: 'fs', reason: 'File reads and writes from the webview — no AgentMC type yet' },
  { namespace: 'keybindings', reason: 'Shortcut registration — no AgentMC type yet' },
  { namespace: 'lms', reason: 'Course and lesson administration — no AgentMC type yet' },
  { namespace: 'locale', reason: 'UI language and formatting locale, read-only — no AgentMC type yet' },
  { namespace: 'nightytidy2', reason: 'Nightly tidy controls — no AgentMC type yet' },
  { namespace: 'ocr', reason: 'Reads the words out of a picture on this computer — no AgentMC type yet' },
  { namespace: 'overlay', reason: 'Overlay panel surface — no AgentMC type yet' },
  { namespace: 'rpc', reason: 'Panel-to-backend request channel — no AgentMC type yet' },
  { namespace: 'runs', reason: 'Run inspection and cancellation — no AgentMC type yet' },
  { namespace: 'runtime', reason: 'Runtime version and introspection — no AgentMC type yet' },
  { namespace: 'scan', reason: 'Security scanning — no AgentMC type yet' },
  { namespace: 'secrets', reason: 'Encrypted credential storage — no AgentMC type yet' },
  { namespace: 'shotflow', reason: 'Owned by the ShotFlow plugin alone — no AgentMC type yet' },
  { namespace: 'tray', reason: 'Tray menu contributions — no AgentMC type yet' }
]
