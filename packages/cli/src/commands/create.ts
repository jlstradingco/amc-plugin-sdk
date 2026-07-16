import { Command } from 'commander'
import prompts from 'prompts'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { ok, fail, info, actionableError } from '../lib/output.js'

const TEMPLATES = ['basic', 'with-backend', 'full', 'webview'] as const
type Template = typeof TEMPLATES[number]

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

/**
 * Parse a comma-separated `--tags` / prompt value into a bounded, normalized list
 * for the scaffolded manifest. Mirrors the host `sanitizeTags` bounds (≤10 tags,
 * ≤30 chars each, lowercased, deduped, control chars / angle brackets dropped) so a
 * scaffolded manifest never fails upload validation. Empty input falls back to the
 * chosen category, keeping the plugin searchable from day one.
 */
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

// Scaffolded .gitignore. Beyond build output, it excludes env/secret files up front
// (the `git add -A` the scaffold runs — and every one the developer runs later — would
// otherwise commit a `.env` full of keys). `.env.example` stays tracked so the template
// for required vars can be shared safely.
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

// Scaffolded README.md. A fresh plugin shipped with no README is a bare repo the
// author (and anyone they share it with) has to reverse-engineer; this gives them a
// self-describing starting point wired to the exact npm scripts the scaffold writes.
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
    'npm install       # install the SDK + TypeScript',
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
    'See the [AMC Plugin SDK docs](https://jlstradingco.github.io/amc-plugin-sdk/) for the full guide.',
    ''
  ].join('\n')
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
  .option('-t, --template <template>', 'Template: basic, with-backend, full, webview', 'basic')
  .option('--display-name <name>', 'Display name (skips interactive prompt)')
  .option('--description <desc>', 'Plugin description')
  .option('--author <author>', 'Plugin author')
  .option('--category <category>', 'Plugin category', 'other')
  .option('--tags <tags>', 'Comma-separated discoverability tags (defaults to the category)')
  .option('--icon <icon>', 'Lucide icon name', 'puzzle')
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
      icon = opts.icon ?? 'puzzle'
    } else {
      const response = await prompts([
        { type: 'text', name: 'displayName', message: 'Display name', initial: name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') },
        { type: 'text', name: 'description', message: 'Description', initial: 'An AMC plugin' },
        { type: 'text', name: 'author', message: 'Author' },
        { type: 'select', name: 'category', message: 'Category', choices: CATEGORIES.map(c => ({ title: c, value: c })) },
        { type: 'text', name: 'tags', message: 'Tags (comma-separated, blank = category)', initial: '' },
        { type: 'text', name: 'icon', message: 'Lucide icon name', initial: 'puzzle' },
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

    const targetDir = path.resolve(process.cwd(), name)
    if (fs.existsSync(targetDir)) {
      fail(`Directory ${name} already exists`)
      process.exit(1)
    }

    info(`Scaffolding ${name} with template: ${template}...`)

    fs.mkdirSync(targetDir, { recursive: true })

    // manifest.json
    const manifest: Record<string, unknown> = {
      plugin: {
        id: name,
        name: displayName,
        version: '1.0.0',
        author: author,
        description: description,
        icon: icon,
        category: category,
        license: { type: 'free' },
        // Discoverability tags folded into marketplace search + shown as card chips.
        // Taken from `--tags` / the create prompt (bounded to ≤10 tags, ≤30 chars
        // each); an empty entry falls back to the chosen category so the plugin ships
        // searchable on the marketplace from day one.
        tags: tags,
      },
      settings: [],
      storage: { collections: {} },
      migrations: [],
      sdkVersion: '^1.0.0',
    }

    // A webview plugin is flat-JS: files ship as-authored at the root (no tsc
    // compile step), matching how AMC's builtin plugins are structured.
    const isWebview = template === 'webview'
    const uiRoot = isWebview ? path.join(targetDir, 'ui') : path.join(targetDir, 'src', 'ui')

    manifest.ui = {
      entryPoint: isWebview ? 'ui/index.html' : 'dist/ui/index.html',
      sidebar: { title: displayName, icon: icon },
    }

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

    if (isWebview) {
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

    // Backend setup (with-backend and full templates)
    if (template === 'with-backend' || template === 'full') {
      manifest.backend = { entryPoint: 'dist/backend/index.js' }
      manifest.permissions = ['storage']

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

      // Sample test wired to the SDK test harness
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

    // Cron + CLI setup (full template only)
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

    fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

    // package.json. Webview plugins have no compile step, so no build script or
    // TypeScript dependency. Backend templates add a test script + vitest.
    const hasBackend = template === 'with-backend' || template === 'full'
    const scripts: Record<string, string> = isWebview
      ? {
          dev: 'amc-plugin dev',
          package: 'amc-plugin package',
          validate: 'amc-plugin validate',
        }
      : {
          build: 'tsc',
          dev: 'amc-plugin dev',
          package: 'amc-plugin package',
          validate: 'amc-plugin validate',
        }
    const devDependencies: Record<string, string> = isWebview
      ? { '@agent-mc/plugin-sdk': '^1.0.0' }
      : { '@agent-mc/plugin-sdk': '^1.0.0', 'typescript': '^5.5.0' }
    if (hasBackend) {
      scripts.test = 'amc-plugin test'
      devDependencies['vitest'] = '^3.0.0'
    }
    fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify({
      name: name,
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts,
      devDependencies,
    }, null, 2))

    // tsconfig.json — TS templates only. Its absence is the signal that marks a
    // plugin as flat-JS (no tsc run).
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

    // .gitignore
    fs.writeFileSync(path.join(targetDir, '.gitignore'), SCAFFOLD_GITIGNORE)

    // README.md
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

    // Install dependencies
    if (!opts.skipInstall) {
      info('Installing dependencies...')
      execSync('npm install', { cwd: targetDir, stdio: 'inherit' })
    }

    // Init git
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
  })
