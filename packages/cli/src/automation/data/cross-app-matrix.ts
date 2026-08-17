// GENERATED — do NOT edit by hand.
//
// A snapshot of AMC cross-app composability matrix, shipped with the SDK so a
// third-party author can validate a listing OFFLINE. They have no access to the
// internal endpoint-index.md, so without this the host-capabilities check could
// not run at all.
//
// REFRESH: in the Agent-Orchestrator repo run npm run matrix:reindex, then re-run
// the slimming step that produced this file.
//
// SKEW IS EXPECTED AND HANDLED. An SDK shipping an older snapshot will not know
// about surfaces added since. That is exactly the not-present case that
// GET /capabilities/probe reports at run time, so the failure surfaces as an
// actionable install-time message rather than silently.

export interface SdkCrossAppSurface {
  surface: string
  pathPrefixes: string[]
  status: string | null
  identity: string | null
}

export const CROSS_APP_MATRIX: SdkCrossAppSurface[] = [
  {
    "surface": "agent-email",
    "pathPrefixes": [
      "/agent"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "agent-sessions",
    "pathPrefixes": [
      "/agent"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "agent-status-board",
    "pathPrefixes": [
      "/agent-status-board"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "ai-browser",
    "pathPrefixes": [
      "/ai-browser"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "ai-coaching",
    "pathPrefixes": [
      "/ai-coaching"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "ai-manager",
    "pathPrefixes": [
      "/ai-manager"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "airtable",
    "pathPrefixes": [
      "/airtable"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "alarms",
    "pathPrefixes": [
      "/alarms"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "alert",
    "pathPrefixes": [
      "/alert"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "app-control",
    "pathPrefixes": [
      "/app",
      "/backup",
      "/backup-mirror",
      "/gpu",
      "/sync-drift"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "app-update",
    "pathPrefixes": [
      "/app",
      "/changelog"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "app-version",
    "pathPrefixes": [
      "/app-update"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "arij",
    "pathPrefixes": [
      "/arij"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "autohotkey",
    "pathPrefixes": [
      "/ahk",
      "/ahk-manager"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "automations",
    "pathPrefixes": [
      "/automation",
      "/automation-helper",
      "/email-intake-rules",
      "/owner-routing-rules"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "away-mode",
    "pathPrefixes": [
      "/away-mode"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "bookmarks",
    "pathPrefixes": [
      "/bookmarks"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "broadcasts",
    "pathPrefixes": [
      "/broadcasts"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "browser-logins",
    "pathPrefixes": [
      "/browser-logins"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "capture",
    "pathPrefixes": [
      "/capture"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "channels",
    "pathPrefixes": [
      "/channels"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "clickup",
    "pathPrefixes": [
      "/clickup"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "clipboard",
    "pathPrefixes": [
      "/clipboard-history"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "cloud-control",
    "pathPrefixes": [
      "/cloud"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "cloud-storage",
    "pathPrefixes": [
      "/dropbox",
      "/onedrive"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "coaching",
    "pathPrefixes": [
      "/coaching"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "codebase-stats",
    "pathPrefixes": [
      "/codebase-stats",
      "/dep-security"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "connected-tools",
    "pathPrefixes": [
      "/agent-tools",
      "/toolchain",
      "/tools"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "contextdock",
    "pathPrefixes": [
      "/contextdock"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "convert",
    "pathPrefixes": [
      "/convert",
      "/download"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "council",
    "pathPrefixes": [
      "/council"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "cron",
    "pathPrefixes": [
      "/cron"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "cross-session-messaging",
    "pathPrefixes": [
      "/sessions"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "daily-digest",
    "pathPrefixes": [
      "/daily-digest"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "data-transfer",
    "pathPrefixes": [
      "/backup",
      "/backup-mirror",
      "/data",
      "/portable-backup"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "decks",
    "pathPrefixes": [
      "/cards",
      "/decks"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "dev-pipeline",
    "pathPrefixes": [
      "/auto-lander",
      "/dev-pipeline",
      "/pr-prep"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "diagnostics",
    "pathPrefixes": [
      "/diag",
      "/diagnostics",
      "/doc-token",
      "/master-debt",
      "/mcp",
      "/mcp-bloat",
      "/safe-mode",
      "/session-escape",
      "/tools"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "doc-token-alerts",
    "pathPrefixes": [
      "/doc-token-alerts"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "drip",
    "pathPrefixes": [
      "/drip"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "email-summarizer",
    "pathPrefixes": [
      "/email-summarizer"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "feature-nudge",
    "pathPrefixes": [
      "/feature-nudge"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "feedback",
    "pathPrefixes": [
      "/feedback"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "filtered-items",
    "pathPrefixes": [
      "/filtered-items"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "flowcharts",
    "pathPrefixes": [
      "/flowcharts"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "focus-mode",
    "pathPrefixes": [
      "/focus-mode"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "foundry",
    "pathPrefixes": [
      "/foundry"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "gmail",
    "pathPrefixes": [
      "/gmail"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "google-apis",
    "pathPrefixes": [
      "/drive",
      "/gdoc",
      "/google"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "granola",
    "pathPrefixes": [
      "/granola"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "habits",
    "pathPrefixes": [
      "/habits"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "helpdesk",
    "pathPrefixes": [
      "/helpdesk"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "inbox",
    "pathPrefixes": [
      "/inbox"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "inbox-pilot",
    "pathPrefixes": [
      "/inbox-pilot"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "inbox-rules",
    "pathPrefixes": [
      "/inbox-rules"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "intake-sources",
    "pathPrefixes": [
      "/agent",
      "/intake"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "jira",
    "pathPrefixes": [
      "/jira"
    ],
    "status": "GET /jira/status",
    "identity": "issue.key"
  },
  {
    "surface": "job-monitor",
    "pathPrefixes": [
      "/job-monitor"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "journal",
    "pathPrefixes": [
      "/journal"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "keybindings",
    "pathPrefixes": [
      "/keybindings"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "kms",
    "pathPrefixes": [
      "/kms"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "life-inventory",
    "pathPrefixes": [
      "/life-inventory"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "linear",
    "pathPrefixes": [
      "/linear"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "local-chat",
    "pathPrefixes": [
      "/local-chat"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "managed-mcp",
    "pathPrefixes": [
      "/managed-mcp"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "mcp-credential",
    "pathPrefixes": [
      "/mcp"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "mcp-servers",
    "pathPrefixes": [
      "/managed-mcp",
      "/mcp-bloat",
      "/mcp-servers"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "meetings",
    "pathPrefixes": [
      "/meetings"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "mempalace",
    "pathPrefixes": [
      "/mempalace"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "merge-priority",
    "pathPrefixes": [
      "/merge-priority"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "mindmaps",
    "pathPrefixes": [
      "/mindmaps"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "native-browser",
    "pathPrefixes": [
      "/native-browser"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "night-shift",
    "pathPrefixes": [
      "/night-shift"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "nighty-tidy-2",
    "pathPrefixes": [
      "/nighty-tidy-2"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "notification",
    "pathPrefixes": [
      "/notifications"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "notion",
    "pathPrefixes": [
      "/notion"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "openclaw-port",
    "pathPrefixes": [
      "/openclaw-port"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "outbound-webhooks",
    "pathPrefixes": [
      "/outbound-webhooks"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "pending-actions",
    "pathPrefixes": [
      "/cli-pending"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "plugins",
    "pathPrefixes": [
      "/marketplace",
      "/plugins"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "pm",
    "pathPrefixes": [
      "/pm"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "pomodoro",
    "pathPrefixes": [
      "/pomodoro"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "pr-merge-queue",
    "pathPrefixes": [
      "/pr-inbox",
      "/pr-merge-queue"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "privacy",
    "pathPrefixes": [
      "/privacy"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "projects",
    "pathPrefixes": [
      "/agent-instructions",
      "/chrome-extensions",
      "/deploy-profiles",
      "/dividers",
      "/project",
      "/projects",
      "/sidebar"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "provider-config-sync",
    "pathPrefixes": [
      "/provider-config-sync"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "qa-testing",
    "pathPrefixes": [
      "/qa-testing"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "quick-email",
    "pathPrefixes": [
      "/quick-email"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "quick-replies",
    "pathPrefixes": [
      "/quick-replies"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "read-and-status",
    "pathPrefixes": [
      "/accounts",
      "/capabilities",
      "/focus",
      "/focus-mode",
      "/inbox",
      "/ping",
      "/post-restore",
      "/recovery-queue",
      "/search",
      "/secrets",
      "/state",
      "/status",
      "/superprompt",
      "/zapier"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "reading-queue",
    "pathPrefixes": [
      "/reading-queue"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "real-chrome",
    "pathPrefixes": [
      "/real-chrome"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "recipe-runs",
    "pathPrefixes": [
      "/recipe"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "recipes",
    "pathPrefixes": [
      "/recipe",
      "/recipes"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "repo-foundations",
    "pathPrefixes": [
      "/repo-foundations"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "repoguard",
    "pathPrefixes": [
      "/repoguard"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "rss",
    "pathPrefixes": [
      "/rss"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "running-apps",
    "pathPrefixes": [
      "/portless"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "saved-prompts",
    "pathPrefixes": [
      "/saved-prompts"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "scheduled-messages",
    "pathPrefixes": [
      "/scheduled-messages"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "scratchpads",
    "pathPrefixes": [
      "/scratchpads"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "session-forensics",
    "pathPrefixes": [
      "/session-forensics"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "sessions",
    "pathPrefixes": [
      "/cpu-burst",
      "/session",
      "/sessions"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "sessions-spawn",
    "pathPrefixes": [
      "/fanout",
      "/project"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "settings",
    "pathPrefixes": [
      "/custom-themes",
      "/settings"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "settings-search",
    "pathPrefixes": [
      "/settings"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "share",
    "pathPrefixes": [
      "/gdoc",
      "/share"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "sheets-edit",
    "pathPrefixes": [
      "/google"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "skills",
    "pathPrefixes": [
      "/skills"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "slack",
    "pathPrefixes": [
      "/slack"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "sms",
    "pathPrefixes": [
      "/sms"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "spam",
    "pathPrefixes": [
      "/spam"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "special-events",
    "pathPrefixes": [
      "/special-events"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "ssh-remotes",
    "pathPrefixes": [
      "/ssh"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "statistics",
    "pathPrefixes": [
      "/stats"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "sticky-notes",
    "pathPrefixes": [
      "/sticky-notes"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "supermail",
    "pathPrefixes": [
      "/supermail"
    ],
    "status": "GET /supermail/status",
    "identity": "thread.id"
  },
  {
    "surface": "supermail-ai-filter",
    "pathPrefixes": [
      "/supermail"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "supermail-control",
    "pathPrefixes": [
      "/supermail"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "supermail-filters",
    "pathPrefixes": [
      "/supermail"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "supermail-lists",
    "pathPrefixes": [
      "/supermail"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "supermail-splits",
    "pathPrefixes": [
      "/supermail"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "support-chat",
    "pathPrefixes": [
      "/support-chat"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "tags",
    "pathPrefixes": [
      "/sessions",
      "/tags"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "tasks-v2",
    "pathPrefixes": [
      "/tasks-v2",
      "/tasks-v2-lists"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "team-chat",
    "pathPrefixes": [
      "/mc",
      "/team-chat"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "team-time",
    "pathPrefixes": [
      "/team-time"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "team-time-meeting",
    "pathPrefixes": [
      "/team-time"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "telegram",
    "pathPrefixes": [
      "/telegram"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "terminal",
    "pathPrefixes": [
      "/project"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "terminal-snippets",
    "pathPrefixes": [
      "/terminal-snippets"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "time-tracker",
    "pathPrefixes": [
      "/time-tracker"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "trello",
    "pathPrefixes": [
      "/trello"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "typing-tutor",
    "pathPrefixes": [
      "/typing-tutor"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "ui-discovery",
    "pathPrefixes": [
      "/deep-link",
      "/ui"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "voice",
    "pathPrefixes": [
      "/flowvoice",
      "/voice"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "voice-history",
    "pathPrefixes": [
      "/voice"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "voiceprint",
    "pathPrefixes": [
      "/voiceprint"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "web-access",
    "pathPrefixes": [
      "/web-access"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "webhook",
    "pathPrefixes": [
      "/webhook"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "weekly-summary",
    "pathPrefixes": [
      "/weekly-summary"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "whiteboards",
    "pathPrefixes": [
      "/whiteboards"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "windows",
    "pathPrefixes": [
      "/job-monitor",
      "/kms",
      "/quick-launch",
      "/scratchpads",
      "/support-chat",
      "/window"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "workflow-coach",
    "pathPrefixes": [
      "/workflow-coach"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "workflows",
    "pathPrefixes": [
      "/workflow"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "worktree-cleanup",
    "pathPrefixes": [
      "/worktree-cleanup"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "writer",
    "pathPrefixes": [
      "/writer"
    ],
    "status": null,
    "identity": null
  },
  {
    "surface": "zoom-rooms",
    "pathPrefixes": [
      "/meeting-rooms"
    ],
    "status": null,
    "identity": null
  }
]
