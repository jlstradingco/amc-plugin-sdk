export const HOST_MIRROR_PROVENANCE = {
  reconciledAt: '2026-11-03',
  sourceCommit: '8c9a28e2bb1c7dd3269f3ddd71fccb2c2cddc797',
  sourceBranch: 'feat/plugin-webassembly-permission-20261103-230035',
  onOriginMaster: false,
} as const

export const HOST_PERMISSIONS = [
  'storage',
  'secrets',
  'sessions',
  'ai',
  'tts',
  'stt',
  'microphone',
  'network',
  'network.upload',
  'cron',
  'cli',
  'notifications',
  'system',
  'rss',
  'auth',
  'auth.session',
  'auth.sharedSignIn',
  'sessions.readHistory',
  'boards.read',
  'boards.link',
  'sessions.launchAny',
  'sessions.observeStatus',
  'inbox',
  'navigation',
  'chrome',
  'chrome.widget',
  'launch',
  'firebase',
  'recording',
  'spend',
  'coreRead',
  'oauth',
  'channel',
  'workspace.read',
  'workspace.write',
  'workspace.exec',
  'documents.read',
  'documents.write',
  'members.read',
  'email.send',
  'webassembly',
] as const

export const SDK_AHEAD_PERMISSIONS = [] as const

export const HOST_AHEAD_PERMISSIONS = [] as const

export const BRIDGE_PENDING_PERMISSIONS = [] as const

export const KNOWN_TYPE_DELTAS = [] as const
