import { Command } from 'commander'
import prompts from 'prompts'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'

const TEMPLATES = ['basic', 'with-backend', 'full'] as const
type Template = typeof TEMPLATES[number]

const CATEGORIES = ['planning', 'development', 'testing', 'devops', 'productivity', 'other'] as const

export const createCommand = new Command('create')
  .argument('<name>', 'Plugin name (kebab-case)')
  .option('-t, --template <template>', 'Template: basic, with-backend, full', 'basic')
  .description('Scaffold a new AMC plugin project')
  .action(async (name: string, opts: { template: string }) => {
    const template = opts.template as Template
    if (!TEMPLATES.includes(template)) {
      console.error(`Invalid template: ${template}. Choose from: ${TEMPLATES.join(', ')}`)
      process.exit(1)
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      console.error('Plugin name must be kebab-case (lowercase alphanumeric + hyphens)')
      process.exit(1)
    }

    const response = await prompts([
      { type: 'text', name: 'displayName', message: 'Display name', initial: name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') },
      { type: 'text', name: 'description', message: 'Description', initial: 'An AMC plugin' },
      { type: 'text', name: 'author', message: 'Author' },
      { type: 'select', name: 'category', message: 'Category', choices: CATEGORIES.map(c => ({ title: c, value: c })) },
      { type: 'text', name: 'icon', message: 'Lucide icon name', initial: 'puzzle' },
    ])

    if (!response.author) {
      console.error('Cancelled')
      process.exit(1)
    }

    const targetDir = path.resolve(process.cwd(), name)
    if (fs.existsSync(targetDir)) {
      console.error(`Directory ${name} already exists`)
      process.exit(1)
    }

    console.log(`\nScaffolding ${name} with template: ${template}...\n`)

    fs.mkdirSync(targetDir, { recursive: true })

    // manifest.json
    const manifest: Record<string, unknown> = {
      plugin: {
        id: name,
        name: response.displayName,
        version: '1.0.0',
        author: response.author,
        description: response.description,
        icon: response.icon,
        category: response.category,
        license: { type: 'free' },
      },
      settings: [],
      storage: { collections: {} },
      migrations: [],
      sdkVersion: '^1.0.0',
    }

    // UI setup
    manifest.ui = {
      entryPoint: 'dist/ui/index.html',
      sidebar: { title: response.displayName, icon: response.icon },
    }

    fs.mkdirSync(path.join(targetDir, 'src', 'ui'), { recursive: true })

    fs.writeFileSync(path.join(targetDir, 'src', 'ui', 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${response.displayName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; background: var(--surface-50, #fafafa); color: var(--surface-900, #111); }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    p { color: var(--surface-500, #666); }
  </style>
</head>
<body>
  <h1>${response.displayName}</h1>
  <p>${response.description}</p>
  <script src="plugin.js"></script>
</body>
</html>`)

    fs.writeFileSync(path.join(targetDir, 'src', 'ui', 'plugin.ts'), `const amc = window.AgentMC

async function init() {
  const settings = await amc.settings.getAll()
  console.log('Plugin initialized with settings:', settings)
}

init()
`)

    // Backend setup (with-backend and full templates)
    if (template === 'with-backend' || template === 'full') {
      manifest.backend = { entryPoint: 'dist/backend/index.js' }
      manifest.permissions = ['storage']

      fs.mkdirSync(path.join(targetDir, 'src', 'backend'), { recursive: true })

      fs.writeFileSync(path.join(targetDir, 'src', 'backend', 'index.ts'), `import type { PluginActivate } from '@amc/plugin-sdk'

const activate: PluginActivate = (ctx) => {
  return {
    onEnable() {
      ctx.log.info('${response.displayName} enabled')
    },

    onDisable() {
      ctx.log.info('${response.displayName} disabled')
    },

    onSettingsChanged(settings) {
      ctx.log.info('Settings changed:', settings)
    },
  }
}

export default activate
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

    // package.json
    fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify({
      name: name,
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: {
        build: 'tsc',
        dev: 'amc-plugin dev',
        package: 'amc-plugin package',
        validate: 'amc-plugin validate',
      },
      devDependencies: {
        '@amc/plugin-sdk': '^1.0.0',
        'typescript': '^5.5.0',
      },
    }, null, 2))

    // tsconfig.json
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
    }, null, 2))

    // .gitignore
    fs.writeFileSync(path.join(targetDir, '.gitignore'), 'node_modules/\ndist/\n*.amcplugin\n')

    // Install dependencies
    console.log('Installing dependencies...')
    execSync('npm install', { cwd: targetDir, stdio: 'inherit' })

    // Init git
    execSync('git init', { cwd: targetDir, stdio: 'pipe' })
    execSync('git add -A', { cwd: targetDir, stdio: 'pipe' })
    execSync('git commit -m "Initial plugin scaffold"', { cwd: targetDir, stdio: 'pipe' })

    console.log(`\nPlugin scaffolded at ./${name}/`)
    console.log('\nNext steps:')
    console.log(`  cd ${name}`)
    console.log('  npm run build')
    console.log('  npm run dev')
  })
