import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AMC Plugin SDK',
  description: 'Build plugins for Agent Mission Control',
  base: '/amc-plugin-sdk/',
  appearance: false,
  head: [['link', { rel: 'icon', href: '/amc-plugin-sdk/logo.svg' }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
      { text: 'Examples', link: '/examples/' },
      { text: 'CLI', link: '/reference/cli' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Project Structure', link: '/guide/project-structure' },
            { text: 'Manifest', link: '/guide/manifest' },
            { text: 'Permissions', link: '/guide/permissions' },
            { text: 'Dev Shell', link: '/guide/dev-shell' },
            { text: 'Publishing', link: '/guide/publishing' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Storage', link: '/api/storage' },
            { text: 'Database', link: '/api/db' },
            { text: 'Sessions', link: '/api/sessions' },
            { text: 'AI', link: '/api/ai' },
            { text: 'Filesystem', link: '/api/fs' },
            { text: 'HTTP', link: '/api/http' },
            { text: 'Cron', link: '/api/cron' },
            { text: 'CLI Endpoints', link: '/api/cli' },
            { text: 'Sidebar', link: '/api/sidebar' },
            { text: 'Toast', link: '/api/toast' },
            { text: 'Inbox', link: '/api/inbox' },
            { text: 'Auth', link: '/api/auth' },
            { text: 'Recording', link: '/api/recording' },
            { text: 'Settings', link: '/api/settings' },
            { text: 'Events', link: '/api/events' },
            { text: 'Logging', link: '/api/logging' }
          ]
        }
      ]
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/jlstradingco/amc-plugin-sdk' }],
    search: { provider: 'local' },
    footer: {
      message: 'AMC Plugin SDK'
    }
  }
})
