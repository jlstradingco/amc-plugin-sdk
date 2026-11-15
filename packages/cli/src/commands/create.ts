import { Command } from 'commander'
import prompts, { type PromptObject } from 'prompts'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { classifyPluginIcon, SIDEBAR_WIDGET_TITLE_MAX } from '@omniscio/plugin-sdk'
import { ok, fail, info, actionableError } from '../lib/output.js'

const CLI_VERSION: string = createRequire(import.meta.url)('../../package.json').version

const TEMPLATES = ['basic', 'with-backend', 'full', 'webview', 'widget'] as const
type Template = typeof TEMPLATES[number]

const isSvgPath = (icon: string): boolean => icon.toLowerCase().endsWith('.svg')

const SHIPPED_ICON_ROOTS: Record<Template, string[]> = {
  basic: ['assets'],
  'with-backend': ['assets'],
  full: ['assets'],
  webview: ['assets', 'ui', 'prompts'],
  widget: ['assets', 'ui', 'prompts'],
}

const CATEGORIES = ['planning', 'development', 'testing', 'devops', 'productivity', 'other'] as const

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const MAX_TAGS = 10
const MAX_TAG_LEN = 30
const SCAFFOLD_SDK_RANGE = '^3.4.0'

export function parseTagsInput(raw: string | undefined, fallbackCategory: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of (raw ?? '').split(',')) {
    const tag = part.trim().toLowerCase()
    if (tag.length === 0 || tag.length > MAX_TAG_LEN) continue
    if (/[\u0000-\u001f<>]/.test(tag)) continue
    if (seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out.length > 0 ? out : [fallbackCategory]
}

export const WIDGET_PLUGIN_JS = `// Plain-JS sidebar plugin: sends data to a sidebar tile and switches it from the panel page.
const amc = window.Omniscio ?? window.AgentMC
const TILE = { widgetId: 'status' }
const OPEN_INBOX = { id: 'open-inbox', label: 'Open inbox', action: 'open-place', target: 'omniscio://inbox' }
const ROWS = [
  { label: 'Write the first widget', detail: 'done' },
  { label: 'Try the number face', detail: 'next', tone: 'needs-you' },
]
const toggleButton = document.getElementById('toggle')
const statusEl = document.getElementById('status')
let showingList = true

function say(text) {
  statusEl.textContent = text
}

function listSpec() {
  return { shape: 'list', title: 'Today', icon: 'Sparkles', items: ROWS, buttons: [OPEN_INBOX] }
}

function statSpec() {
  return { shape: 'stat', value: String(ROWS.length), label: 'things to do', icon: 'Sparkles', buttons: [OPEN_INBOX] }
}

async function render() {
  try {
    await amc.widget.set(showingList ? listSpec() : statSpec(), TILE)
    say(showingList ? 'The tile shows a list.' : 'The tile shows a number.')
  } catch (err) {
    say('That did not work: ' + (err instanceof Error ? err.message : String(err)))
  }
}

if (amc && amc.widget && amc.widget.set) {
  toggleButton.addEventListener('click', () => {
    showingList = !showingList
    render()
  })
  render()
} else {
  say('Omniscio.widget is not available here.')
}
`

export function buildWidgetPageHtml(displayName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(displayName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px; background: var(--surface-50, #fafafa); color: var(--surface-900, #111); }
    h1 { font-size: 1rem; margin-bottom: 8px; }
    p { color: var(--surface-500, #666); font-size: 0.875rem; margin-bottom: 12px; }
    button { padding: 6px 12px; font: inherit; font-size: 0.875rem; margin-bottom: 12px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(displayName)}</h1>
  <p>This page is the panel widget. The Status tile in the sidebar shows what plugin.js sends it.</p>
  <button id="toggle">Switch the tile between a list and a number</button>
  <p id="status"></p>
  <script src="plugin.js"></script>
</body>
</html>
`
}

function widgetTitle(text: string): string {
  return text.slice(0, SIDEBAR_WIDGET_TITLE_MAX).trim()
}

export function buildWidgetDeclarations(displayName: string): Record<string, unknown>[] {
  return [
    {
      id: 'status',
      title: widgetTitle(displayName),
      kind: 'tile',
      defaultSize: { w: 4, h: 3 },
      faces: ['list', 'stat'],
    },
    {
      id: 'panel',
      title: widgetTitle(`${displayName} panel`),
      kind: 'panel',
      defaultSize: { w: 4, h: 6 },
    },
  ]
}

export function buildBasicPageHtml(displayName: string, description: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(displayName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; background: var(--surface-50, #fafafa); color: var(--surface-900, #111); }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    p { color: var(--surface-500, #666); }
  </style>
</head>
<body>
  <h1>${escapeHtml(displayName)}</h1>
  <p>${escapeHtml(description)}</p>
  <script src="plugin.js"></script>
</body>
</html>`
}

const SCAFFOLD_GITIGNORE = [
  '# Dependencies',
  'node_modules/',
  '',
  '# Build output',
  'dist/',
  '*.amcplugin',
  '',
  '# Secrets / local env — never commit these',
  '.env',
  '.env.*',
  '!.env.example',
  '*.local',
  '',
  '# Logs & editor / OS cruft',
  '*.log',
  '.DS_Store',
  '.vscode/',
  '.idea/',
  ''
].join('\n')

function gettingStartedBlock(isWebview: boolean): string[] {
  const commands = [
    'npm install       # install the SDK, the omniscio-plugin CLI' + (isWebview ? '' : ' + TypeScript'),
    'npm run dev       # launch the dev shell with hot reload',
    ...(isWebview ? [] : ['npm run build     # compile src/ to dist/']),
    'npm run validate  # check the manifest',
    'npm run package   # bundle a distributable .amcplugin',
  ]
  return ['```bash', ...commands, '```']
}

function layoutBlock(opts: { hasBackend: boolean; isWebview: boolean }): string[] {
  const { hasBackend, isWebview } = opts
  if (isWebview) {
    return [
      'manifest.json   plugin metadata, permissions, settings',
      'ui/             webview UI (index.html + plugin.js) — no build step, edit and reload',
    ]
  }
  return [
    'manifest.json   plugin metadata, permissions, settings',
    'src/ui/         webview UI (index.html + plugin.ts)',
    ...(hasBackend ? ['src/backend/    backend entry (onEnable / onDisable lifecycle)'] : []),
    'dist/           build output (gitignored)',
  ]
}

export function buildReadme(opts: {
  displayName: string
  description: string
  id: string
  category: string
  tags: string[]
  hasBackend: boolean
  isWebview: boolean
}): string {
  const { displayName, description, id, category, tags, hasBackend, isWebview } = opts
  return [
    `# ${displayName}`,
    '',
    description,
    '',
    `- **Plugin ID:** \`${id}\``,
    `- **Category:** ${category}`,
    `- **Tags:** ${tags.join(', ')}`,
    '',
    '## Getting started',
    '',
    ...gettingStartedBlock(isWebview),
    '',
    '## Project layout',
    '',
    '```',
    ...layoutBlock({ hasBackend, isWebview }),
    '```',
    '',
    '## Publishing',
    '',
    'Bump the version in `manifest.json`, then:',
    '',
    '```bash',
    'npm run package',
    'npx omniscio-plugin publish',
    '```',
    '',
    'See the [Omniscio Plugin SDK docs](https://docs.omniscio.com/sdk/) for the full guide.',
    ''
  ].join('\n')
}

export function buildPackageJson(opts: {
  id: string
  description: string
  author: string
  isWebview?: boolean
  hasBackend?: boolean
}): Record<string, unknown> {
  const { id, description, author, isWebview = false, hasBackend = false } = opts
  const pkg: Record<string, unknown> = {
    name: id,
    version: '1.0.0',
    private: true,
    type: 'module',
  }
  if (description) pkg.description = description
  if (author) pkg.author = author
  pkg.license = 'UNLICENSED'

  const scripts: Record<string, string> = isWebview
    ? {
        dev: 'omniscio-plugin dev',
        package: 'omniscio-plugin package',
        validate: 'omniscio-plugin validate',
      }
    : {
        build: 'omniscio-plugin build',
        dev: 'omniscio-plugin dev',
        package: 'omniscio-plugin package',
        validate: 'omniscio-plugin validate',
      }
  const devDependencies: Record<string, string> = isWebview
    ? { '@omniscio/plugin-cli': `^${CLI_VERSION}`, '@omniscio/plugin-sdk': SCAFFOLD_SDK_RANGE }
    : { '@omniscio/plugin-cli': `^${CLI_VERSION}`, '@omniscio/plugin-sdk': SCAFFOLD_SDK_RANGE, typescript: '^5.5.0' }
  if (hasBackend) {
    scripts.test = 'omniscio-plugin test'
    devDependencies['vitest'] = '^5.1.0'
  }
  pkg.scripts = scripts
  pkg.devDependencies = devDependencies
  return pkg
}

const HOST_SDK_CONTRACT_FLOOR = '2.0.0'

export function buildManifest(opts: {
  id: string
  displayName: string
  author: string
  description: string
  icon: string
  category: string
  tags: string[]
  template: Template
}): Record<string, unknown> {
  const { id, displayName, author, description, icon, category, tags, template } = opts
  const isWebview = template === 'webview' || template === 'widget'
  const hasBackend = template === 'with-backend' || template === 'full'

  const manifest: Record<string, unknown> = {
    plugin: {
      id,
      name: displayName,
      version: '1.0.0',
      author,
      description,
      icon,
      category,
      license: { type: 'free' },
      tags,
    },
    settings: [],
    storage: { collections: {} },
    migrations: [],
    sdkVersion: HOST_SDK_CONTRACT_FLOOR,
  }

  manifest.ui = {
    entryPoint: isWebview ? 'ui/index.html' : 'dist/ui/index.html',
    sidebar: { title: displayName, icon },
  }

  if (template === 'widget') {
    manifest.permissions = ['chrome', 'chrome.widget']
    manifest.ui = { ...(manifest.ui as Record<string, unknown>), widgets: buildWidgetDeclarations(displayName) }
  }

  if (hasBackend) {
    manifest.backend = { entryPoint: 'dist/backend/index.js' }
    manifest.permissions = ['storage']
  }

  if (template === 'full') {
    manifest.permissions = ['storage', 'cron', 'cli']
    manifest.cli = {
      endpoints: [
        { method: 'GET', path: 'status', description: 'Get plugin status', auth: true },
      ],
    }
    manifest.cron = {
      jobs: [
        { id: 'heartbeat', label: 'Heartbeat Check', schedule: '*/30 * * * *', description: 'Periodic health check', approvalRequired: true },
      ],
    }
  }

  return manifest
}

interface CreateOptions {
  template: string
  displayName?: string
  description?: string
  author?: string
  category?: string
  tags?: string
  icon?: string
  skipInstall?: boolean
  skipGit?: boolean
}

export const createCommand = new Command('create')
  .argument('<name>', 'Plugin name (kebab-case)')
  .option('-t, --template <template>', 'Template: basic, with-backend, full, webview, widget', 'basic')
  .option('--display-name <name>', 'Display name (skips interactive prompt)')
  .option('--description <desc>', 'Plugin description')
  .option('--author <author>', 'Plugin author')
  .option('--category <category>', 'Plugin category', 'other')
  .option('--tags <tags>', 'Comma-separated discoverability tags (defaults to the category)')
  .option(
    '--icon <icon>',
    'Path to your logo inside the package (e.g. assets/icon.svg), or a Lucide icon name for a generic glyph',
    'assets/icon.svg'
  )
  .option('--skip-install', 'Skip npm install')
  .option('--skip-git', 'Skip git init and initial commit')
  .description('Scaffold a new Omniscio plugin project')
  .action(async (name: string, opts: CreateOptions) => {
    const template = opts.template as Template
    if (!TEMPLATES.includes(template)) {
      actionableError(`Invalid template: ${template}`, `Choose from: ${TEMPLATES.join(', ')}`)
      process.exit(1)
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      actionableError('Plugin name must be kebab-case', 'Use lowercase letters, numbers, and hyphens only.')
      process.exit(1)
    }

    let displayName: string
    let description: string
    let author: string
    let category: string
    let tags: string[]
    let icon: string

    if (!CATEGORIES.includes((opts.category ?? 'other') as typeof CATEGORIES[number])) {
      actionableError(`Invalid category: ${opts.category}`, `Choose from: ${CATEGORIES.join(', ')}`)
      process.exit(1)
    }
    category = opts.category ?? 'other'
    const needsPrompt = !opts.displayName || !opts.description || !opts.author
    if (!needsPrompt) {
      displayName = opts.displayName!
      description = opts.description!
      author = opts.author!
      tags = parseTagsInput(opts.tags, category)
      icon = opts.icon ?? 'assets/icon.svg'
    } else {
      const asked: PromptObject[] = []
      if (!opts.displayName) {
        asked.push({
          type: 'text',
          name: 'displayName',
          message: 'Display name',
          initial: name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
        })
      }
      if (!opts.description) {
        asked.push({ type: 'text', name: 'description', message: 'Description', initial: 'An Omniscio plugin' })
      }
      if (!opts.author) asked.push({ type: 'text', name: 'author', message: 'Author' })
      asked.push(
        { type: 'select', name: 'category', message: 'Category', choices: CATEGORIES.map(c => ({ title: c, value: c })), initial: Math.max(0, CATEGORIES.indexOf(category)) },
        { type: 'text', name: 'tags', message: 'Tags (comma-separated, blank = category)', initial: opts.tags ?? '' },
        {
          type: 'text',
          name: 'icon',
          message: 'Icon — a path to your logo in the package (assets/icon.svg), or a Lucide name for a generic glyph',
          initial: opts.icon ?? 'assets/icon.svg'
        }
      )
      const response = await prompts(asked)
      displayName = opts.displayName ?? response.displayName
      description = opts.description ?? response.description
      author = opts.author ?? response.author

      if (!displayName || !description || !author) {
        fail('Cancelled')
        process.exit(1)
      }

      category = response.category ?? category
      tags = parseTagsInput(opts.tags ?? response.tags, category)
      icon = response.icon ?? opts.icon ?? 'assets/icon.svg'
    }

    const iconKind = classifyPluginIcon(icon)
    if (iconKind === 'unsafe-path') {
      actionableError(
        `Invalid --icon: ${icon}`,
        'Use a plain relative path inside the plugin (for example assets/icon.svg), a Lucide icon name, or an http(s) URL.'
      )
      process.exit(1)
    }
    const shippedRoots = SHIPPED_ICON_ROOTS[template]
    if (iconKind === 'packaged-path' && !shippedRoots.includes(icon.split('/')[0])) {
      actionableError(
        `--icon ${icon} would not be shipped in the package`,
        `The ${template} template ships only ${shippedRoots.join(', ')}. Use a path under assets/, for example assets/icon.svg.`
      )
      process.exit(1)
    }

    const targetDir = path.resolve(process.cwd(), name)
    if (fs.existsSync(targetDir)) {
      fail(`Directory ${name} already exists`)
      process.exit(1)
    }

    info(`Scaffolding ${name} with template: ${template}...`)

    fs.mkdirSync(targetDir, { recursive: true })

    const manifest = buildManifest({ id: name, displayName, author, description, icon, category, tags, template })

    const isWebview = template === 'webview' || template === 'widget'
    const uiRoot = isWebview ? path.join(targetDir, 'ui') : path.join(targetDir, 'src', 'ui')

    fs.mkdirSync(uiRoot, { recursive: true })

    fs.writeFileSync(
      path.join(uiRoot, 'index.html'),
      template === 'widget' ? buildWidgetPageHtml(displayName) : buildBasicPageHtml(displayName, description),
    )

    if (template === 'widget') {
      fs.writeFileSync(path.join(uiRoot, 'plugin.js'), WIDGET_PLUGIN_JS)
    } else if (isWebview) {
      fs.writeFileSync(path.join(uiRoot, 'plugin.js'), `// Plain-JS webview plugin — no build step. Edit and reload.
const amc = window.Omniscio ?? window.AgentMC

async function init() {
  const settings = await amc.settings.getAll()
  console.log('Plugin initialized with settings:', settings)
}

init()
`)
    } else {
      fs.writeFileSync(path.join(uiRoot, 'plugin.ts'), `import type { Omniscio } from '@omniscio/plugin-sdk/browser'

const amc: Omniscio = window.Omniscio ?? window.AgentMC

async function init() {
  const settings = await amc.settings.getAll()
  console.log('Plugin initialized with settings:', settings)
}

init()
`)
    }

    if (template === 'with-backend' || template === 'full') {
      fs.mkdirSync(path.join(targetDir, 'src', 'backend'), { recursive: true })

      fs.writeFileSync(path.join(targetDir, 'src', 'backend', 'index.ts'), `import type { PluginActivate } from '@omniscio/plugin-sdk'

const activate: PluginActivate = (ctx) => {
  return {
    onEnable() {
      ctx.log.info('${displayName} enabled')
    },

    onDisable() {
      ctx.log.info('${displayName} disabled')
    },

    onSettingsChanged(settings) {
      ctx.log.info('Settings changed:', settings)
    },
  }
}

export default activate
`)

      fs.writeFileSync(path.join(targetDir, 'src', 'backend', 'index.test.ts'), `import { describe, it, expect } from 'vitest'
import { createTestContext } from '@omniscio/plugin-sdk/testing'
import activate from './index.js'

describe('${displayName} backend', () => {
  it('logs when enabled', () => {
    const h = createTestContext({ pluginId: '${name}', pluginVersion: '1.0.0' })
    const backend = activate(h.ctx)
    backend.onEnable?.()
    expect(h.logs.some((l) => l.message.includes('enabled'))).toBe(true)
  })
})
`)
    }

    if (iconKind === 'packaged-path' && !isSvgPath(icon)) {
      info(`Add your logo at ${icon} before you package — the scaffold only writes an .svg placeholder.`)
    }
    if (iconKind === 'packaged-path' && isSvgPath(icon)) {
      const iconTarget = path.join(targetDir, icon)
      if (!fs.existsSync(iconTarget)) {
        fs.mkdirSync(path.dirname(iconTarget), { recursive: true })
        fs.writeFileSync(
          iconTarget,
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <!-- Placeholder logo for ${displayName}. Replace this file with your own mark. -->
  <rect x="3" y="3" width="18" height="18" rx="5" />
  <path d="M9 12h6M12 9v6" />
</svg>
`
        )
      }
    }

    fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

    const hasBackend = template === 'with-backend' || template === 'full'
    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify(
        buildPackageJson({ id: name, description, author, isWebview, hasBackend }),
        null,
        2,
      ),
    )

    if (!isWebview) {
      fs.writeFileSync(path.join(targetDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          declaration: true,
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          outDir: 'dist',
          rootDir: 'src',
        },
        include: ['src'],
        exclude: ['**/*.test.ts'],
      }, null, 2))
    }

    fs.writeFileSync(path.join(targetDir, '.gitignore'), SCAFFOLD_GITIGNORE)

    fs.writeFileSync(
      path.join(targetDir, 'README.md'),
      buildReadme({
        displayName,
        description,
        id: name,
        category,
        tags,
        hasBackend,
        isWebview,
      }),
    )

    if (!opts.skipInstall) {
      info('Installing dependencies...')
      execSync('npm install', { cwd: targetDir, stdio: 'inherit' })
    }

    if (!opts.skipGit) {
      execSync('git init', { cwd: targetDir, stdio: 'pipe' })
      execSync('git add -A', { cwd: targetDir, stdio: 'pipe' })
      execSync('git commit -m "Initial plugin scaffold"', { cwd: targetDir, stdio: 'pipe' })
    }

    ok(`Plugin scaffolded at ./${name}/`)
    console.log('\nNext steps:')
    console.log(`  cd ${name}`)
    if (opts.skipInstall) {
      console.log('  npm install')
    }
    if (!isWebview) {
      console.log('  npm run build')
    }
    console.log('  npm run dev')
    if (template === 'widget') {
      console.log('\nNote: the dev shell shows your widgets in its left Sidebar preview; the app draws the final look.')
    }
  })
