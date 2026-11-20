export interface PublishedMethodGap {
  surface: 'backend' | 'webview'
  namespace: string
  generatedOnly: readonly string[]
  publishedOnly: readonly string[]
  reason: string
}

export const PUBLISHED_METHOD_GAPS: readonly PublishedMethodGap[] = []

export interface UntypedBridgeNamespace {
  namespace: string
  reason: string
}

export const UNTYPED_BRIDGE_GAPS: readonly UntypedBridgeNamespace[] = [
  {
    namespace: 'autohotkey',
    reason: 'Reserved to the AutoHotkey plugin (ownerPlugin: autohotkey) — no general AgentMC type, and none may be added for anyone else'
  },
  {
    namespace: 'books',
    reason: 'Reserved to the Books plugin (ownerPlugin: books) — only that plugin may reach its own library'
  },
  {
    namespace: 'decks',
    reason: 'Reserved to the Decks plugin (ownerPlugin: decks) — only that plugin may measure and render its own decks'
  },
  {
    namespace: 'flashcards',
    reason: 'Reserved to the Flashcards plugin (ownerPlugin: flashcards) — only that plugin may reach its own study data'
  },
  {
    namespace: 'lms',
    reason: 'Reserved to the LMS plugin (ownerPlugin: lms) — only that plugin may reach its own course data'
  },
  {
    namespace: 'nightytidy2',
    reason: 'Reserved to the NightyTidy plugin (ownerPlugin: nightytidy2) — only that plugin may reach its own audits and runs'
  },
  {
    namespace: 'scan',
    reason: 'Reserved to the RepoGuard plugin (ownerPlugin: repoguard) — only that plugin may reach its own scans'
  },
  {
    namespace: 'shotflow',
    reason: 'Reserved to the ShotFlow plugin (ownerPlugin: shotflow) — only that plugin may reach its own shot lists and images'
  }
]
