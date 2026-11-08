import { Command } from 'commander'
import prompts from 'prompts'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { classifyPluginIcon } from '@agent-mc/plugin-sdk'
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

const WIDGET_PLUGIN_JS = `// Plain-JS webview plugin that draws a titlebar widget. No build step.
//
// You send DATA; Omniscio draws it. Pick a shape, a short value (8 characters
// max), a short label (16 max), a tone (a MEANING, not a colour) and an icon
// NAME from Omniscio's allow-list. Updates coalesce to one per 250 ms, and
// sending an identical spec again does nothing, so push whenever your state changes.
const amc = window.AgentMC

// The dev shell (amc-plugin dev) has no titlebar, so this API is missing there.
// Widgets can only be tried inside Omniscio itself.
if (!amc || !amc.widget || !amc.widget.set) {
  console.log('AgentMC.widget is not available here. Load this plugin inside Omniscio to see it.')
} else {
  let count = 0

  const push = () =>
    amc.widget.set({
      shape: 'stat',
      value: String(count),
      label: 'my widget',
      tone: 'neutral',
      icon: 'Sparkles',
      tooltip: 'Updated ' + count + ' time(s)',
    })

  push()
  setInterval(() => {
    count += 1
    push()
  }, 5000)
}
`

function buildWidgetPopoverHtml(displayName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(displayName)} widget</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px; background: var(--surface-50, #fafafa); color: var(--surface-900, #111); }
    h1 { font-size: 1rem; margin-bottom: 6px; }
    p { font-size: 0.875rem; color: var(--surface-500, #666); }
  </style>
</head>
<body>
  <!-- Shown in the 320x256 popover that opens when the user clicks your titlebar widget. -->
  <h1>${escapeHtml(displayName)}</h1>
  <p>This page opens when the widget is clicked. Replace it with whatever detail sits behind your number.</p>
</body>
</html>
`
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

export function buildReadme(opts: {
  displayName: string
  description: string
  id: string
  category: string
  tags: string[]
  hasBackend: boolean
}): string {
  const { displayName, description, id, category, tags, hasBackend } = opts
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
    '```bash',
    'npm install       # install the SDK, the amc-plugin CLI + TypeScript',
    'npm run dev       # launch the dev shell with hot reload',
    'npm run build     # compile src/ to dist/',
    'npm run validate  # check the manifest',
    'npm run package   # bundle a distributable .amcplugin',
    '```',
    '',
    '## Project layout',
    '',
    '```',
    'manifest.json   plugin metadata, permissions, settings',
    'src/ui/         webview UI (index.html + plugin.ts)',
    ...(hasBackend ? ['src/backend/    backend entry (onEnable / onDisable lifecycle)'] : []),
    'dist/           build output (gitignored)',
    '```',
    '',
    '## Publishing',
    '',
    'Bump the version in `manifest.json`, then:',
    '',
    '```bash',
    'npm run package',
    'amc-plugin publish',
    '```',
    '',
    'See the [AMC Plugin SDK docs](https://docs.omniscio.com/sdk/) for the full guide.',
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
        dev: 'amc-plugin dev',
        package: 'amc-plugin package',
        validate: 'amc-plugin validate',
      }
    : {
        build: 'amc-plugin build',
        dev: 'amc-plugin dev',
        package: 'amc-plugin package',
        validate: 'amc-plugin validate',
      }
  const devDependencies: Record<string, string> = isWebview
    ? { '@agent-mc/plugin-cli': `^${CLI_VERSION}`, '@agent-mc/plugin-sdk': '^3.0.0' }
    : { '@agent-mc/plugin-cli': `^${CLI_VERSION}`, '@agent-mc/plugin-sdk': '^3.0.0', typescript: '^5.5.0' }
  if (hasBackend) {
    scripts.test = 'amc-plugin test'
    devDependencies['vitest'] = '^3.0.0'
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
    manifest.ui = { ...(manifest.ui as Record<string, unknown>), widget: { entryPoint: 'ui/widget.html' } }
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
  .description('Scaffold a new AMC plugin project')
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

    const hasAllOptions = opts.displayName && opts.description && opts.author
    if (hasAllOptions) {
      if (!CATEGORIES.includes(opts.category as typeof CATEGORIES[number])) {
        actionableError(`Invalid category: ${opts.category}`, `Choose from: ${CATEGORIES.join(', ')}`)
        process.exit(1)
      }
      displayName = opts.displayName!
      description = opts.description!
      author = opts.author!
      category = opts.category ?? 'other'
      tags = parseTagsInput(opts.tags, category)
      icon = opts.icon ?? 'assets/icon.svg'
    } else {
      const response = await prompts([
        { type: 'text', name: 'displayName', message: 'Display name', initial: name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') },
        { type: 'text', name: 'description', message: 'Description', initial: 'An AMC plugin' },
        { type: 'text', name: 'author', message: 'Author' },
        { type: 'select', name: 'category', message: 'Category', choices: CATEGORIES.map(c => ({ title: c, value: c })) },
        { type: 'text', name: 'tags', message: 'Tags (comma-separated, blank = category)', initial: '' },
        {
          type: 'text',
          name: 'icon',
          message: 'Icon — a path to your logo in the package (assets/icon.svg), or a Lucide name for a generic glyph',
          initial: 'assets/icon.svg'
        },
      ])

      if (!response.author) {
        fail('Cancelled')
        process.exit(1)
      }

      displayName = response.displayName
      description = response.description
      author = response.author
      category = response.category
      tags = parseTagsInput(response.tags, category)
      icon = response.icon
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

    fs.writeFileSync(path.join(uiRoot, 'index.html'), `<!DOCTYPE html>
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
</html>`)

    if (template === 'widget') {
      fs.writeFileSync(path.join(uiRoot, 'plugin.js'), WIDGET_PLUGIN_JS)
      fs.writeFileSync(path.join(uiRoot, 'widget.html'), buildWidgetPopoverHtml(displayName))
    } else if (isWebview) {
      fs.writeFileSync(path.join(uiRoot, 'plugin.js'), `// Plain-JS webview plugin — no build step. Edit and reload.
const amc = window.AgentMC

async function init() {
  const settings = await amc.settings.getAll()
  console.log('Plugin initialized with settings:', settings)
}

init()
`)
    } else {
      fs.writeFileSync(path.join(uiRoot, 'plugin.ts'), `import type { AgentMC } from '@agent-mc/plugin-sdk/browser'

const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC

async function init() {
  const settings = await amc.settings.getAll()
  console.log('Plugin initialized with settings:', settings)
}

init()
`)
    }

    if (template === 'with-backend' || template === 'full') {
      fs.mkdirSync(path.join(targetDir, 'src', 'backend'), { recursive: true })

      fs.writeFileSync(path.join(targetDir, 'src', 'backend', 'index.ts'), `import type { PluginActivate } from '@agent-mc/plugin-sdk'

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
import { createTestContext } from '@agent-mc/plugin-sdk/testing'
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
      console.log('\nNote: the dev shell has no titlebar, so the widget only appears inside Omniscio.')
    }
  })
