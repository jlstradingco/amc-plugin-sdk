import { defineConfig } from 'vitepress'
import { SDK_SITE_DESCRIPTION, SDK_SITE_TITLE, sdkHeadTags } from './site-head.mjs'

export default defineConfig({
  title: SDK_SITE_TITLE,
  description: SDK_SITE_DESCRIPTION,
  base: '/sdk/',
  outDir: '../../docs/help-site/public/sdk',
  appearance: false,
  metaChunk: true,
  transformHead({ pageData, title, description }) {
    return sdkHeadTags({
      relativePath: pageData.relativePath,
      title: title || pageData.title,
      description: description || pageData.description
    })
  },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/quickstart' },
      { text: 'API', link: '/api/' },
      { text: 'Examples', link: '/examples/' },
      { text: 'CLI', link: '/reference/cli' },
      { text: 'Automations', link: '/guide/automations' }
    ],
    sidebar: {
      '/reference/': [
        {
          text: 'CLI Reference',
          items: [
            { text: 'omniscio-plugin', link: '/reference/cli' },
            { text: 'omniscio-automation', link: '/reference/automation-cli' }
          ]
        }
      ],
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Quickstart', link: '/guide/quickstart' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Project Structure', link: '/guide/project-structure' },
            { text: 'Manifest', link: '/guide/manifest' },
            { text: 'Permissions', link: '/guide/permissions' },
            { text: 'Theming', link: '/guide/theming' },
            { text: 'Panel Commands', link: '/guide/commands' },
            { text: 'Dev Shell', link: '/guide/dev-shell' },
            { text: 'Publishing', link: '/guide/publishing' },
            { text: 'Automations', link: '/guide/automations' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Storage', link: '/api/storage' },
            { text: 'Secrets', link: '/api/secrets' },
            { text: 'Database', link: '/api/db' },
            { text: 'Sessions', link: '/api/sessions' },
            { text: 'AI', link: '/api/ai' },
            { text: 'Filesystem', link: '/api/fs' },
            { text: 'HTTP', link: '/api/http' },
            { text: 'Cron', link: '/api/cron' },
            { text: 'CLI Endpoints', link: '/api/cli' },
            { text: 'Sidebar', link: '/api/sidebar' },
            { text: 'Toast', link: '/api/toast' },
            { text: 'Settings', link: '/api/settings' },
            { text: 'Events', link: '/api/events' },
            { text: 'Logging', link: '/api/logging' },
            { text: 'Inbox', link: '/api/inbox' },
            { text: 'Auth', link: '/api/auth' },
            { text: 'Recording', link: '/api/recording' },
            { text: 'Email', link: '/api/email' },
            { text: 'Text to Speech', link: '/api/tts' },
            { text: 'Session History', link: '/api/session-history' },
            { text: 'Firebase', link: '/api/firebase' },
            { text: 'Spend', link: '/api/spend' },
            { text: 'Workspace', link: '/api/workspace' },
            { text: 'Core', link: '/api/core' },
            { text: 'Widget', link: '/api/widget' },
            { text: 'Boards', link: '/api/boards' },
            { text: 'Board Links', link: '/api/board-links' },
            { text: 'Calendar', link: '/api/calendar' },
            { text: 'Channel', link: '/api/channel' },
            { text: 'Clipboard', link: '/api/clipboard' },
            { text: 'Launch', link: '/api/launch' },
            { text: 'Members', link: '/api/members' },
            { text: 'Navigation', link: '/api/navigation' },
            { text: 'Notifications', link: '/api/notifications' },
            { text: 'OAuth', link: '/api/oauth' },
            { text: 'People', link: '/api/people' },
            { text: 'Process', link: '/api/process' },
            { text: 'RSS', link: '/api/rss' },
            { text: 'Session Control', link: '/api/session-control' },
            { text: 'Share', link: '/api/share' },
            { text: 'Shell', link: '/api/shell' },
            { text: 'Speech to Text', link: '/api/stt' },
            { text: 'Tasks', link: '/api/tasks' },
            { text: 'Vault', link: '/api/vault' }
          ]
        }
      ]
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/jlstradingco/amc-plugin-sdk' }],
    search: { provider: 'local' },
    footer: {
      message: 'Omniscio Plugin SDK'
    }
  }
})
