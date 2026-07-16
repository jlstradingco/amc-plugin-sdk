<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import {
  Blocks,
  Terminal,
  Zap,
  FileCode,
  Store,
  LayoutTemplate,
  Check
} from 'lucide-vue-next'

const copied = ref(false)
const typedLength = ref(0)
const isTypingDone = ref(false)
const showSuccess = ref(false)
const hasStartedTyping = ref(false)

function copyInstall() {
  navigator.clipboard.writeText('npm install -g @agent-mc/plugin-cli')
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

// Each segment is either plain text or a span with a token class
interface Segment {
  text: string
  cls?: string
}

const codeLines: Segment[][] = [
  [
    { text: 'import', cls: 'tok-keyword' },
    { text: ' { ' },
    { text: 'definePlugin', cls: 'tok-fn' },
    { text: ' } ' },
    { text: 'from', cls: 'tok-keyword' },
    { text: ' ' },
    { text: "'@agent-mc/plugin-sdk'", cls: 'tok-string' },
  ],
  [],
  [
    { text: 'export default', cls: 'tok-keyword' },
    { text: ' ' },
    { text: 'definePlugin', cls: 'tok-fn' },
    { text: '({' },
  ],
  [
    { text: '  ' },
    { text: 'name', cls: 'tok-prop' },
    { text: ': ' },
    { text: "'my-plugin'", cls: 'tok-string' },
    { text: ',' },
  ],
  [
    { text: '  ' },
    { text: 'version', cls: 'tok-prop' },
    { text: ': ' },
    { text: "'1.0.0'", cls: 'tok-string' },
    { text: ',' },
  ],
  [],
  [
    { text: '  ' },
    { text: 'backend', cls: 'tok-prop' },
    { text: ': {' },
  ],
  [
    { text: '    ' },
    { text: 'onSessionEvent', cls: 'tok-fn' },
    { text: '({ ' },
    { text: 'sessions', cls: 'tok-param' },
    { text: ', ' },
    { text: 'toast', cls: 'tok-param' },
    { text: ' }) {' },
  ],
  [
    { text: '      sessions.' },
    { text: 'onStatusChange', cls: 'tok-fn' },
    { text: '(' },
    { text: "'needs_you'", cls: 'tok-string' },
    { text: ', (' },
    { text: 'session', cls: 'tok-param' },
    { text: ') => {' },
  ],
  [
    { text: '        toast.' },
    { text: 'show', cls: 'tok-fn' },
    { text: '(' },
    { text: '`Attention: ', cls: 'tok-string' },
    { text: '${session.name}', cls: 'tok-interp' },
    { text: '`', cls: 'tok-string' },
    { text: ')' },
  ],
  [
    { text: '      })' },
  ],
  [
    { text: '    }' },
  ],
  [
    { text: '  }' },
  ],
  [
    { text: '})' },
  ],
]

// Flatten all characters with their token class for the typing effect
interface FlatChar {
  char: string
  cls?: string
  lineIdx: number
}

const flatChars = computed<FlatChar[]>(() => {
  const result: FlatChar[] = []
  codeLines.forEach((line, lineIdx) => {
    if (lineIdx > 0) {
      result.push({ char: '\n', lineIdx })
    }
    for (const seg of line) {
      for (const ch of seg.text) {
        result.push({ char: ch, cls: seg.cls, lineIdx })
      }
    }
  })
  return result
})

const totalChars = computed(() => flatChars.value.length)

// Build the visible HTML from typed characters
const visibleHtml = computed(() => {
  const chars = flatChars.value.slice(0, typedLength.value)
  let html = ''
  let currentCls: string | undefined = undefined
  let inSpan = false

  for (const c of chars) {
    if (c.cls !== currentCls) {
      if (inSpan) { html += '</span>'; inSpan = false }
      if (c.cls) { html += `<span class="${c.cls}">`; inSpan = true }
      currentCls = c.cls
    }
    if (c.char === '\n') {
      if (inSpan) { html += '</span>'; inSpan = false; currentCls = undefined }
      html += '\n'
    } else if (c.char === '<') {
      html += '&lt;'
    } else if (c.char === '>') {
      html += '&gt;'
    } else if (c.char === '&') {
      html += '&amp;'
    } else {
      html += c.char
    }
  }
  if (inSpan) html += '</span>'
  return html
})

// Cursor blink state
const showCursor = ref(true)
let cursorInterval: ReturnType<typeof setInterval> | undefined

function startTyping() {
  if (hasStartedTyping.value) return
  hasStartedTyping.value = true

  // Blink cursor
  cursorInterval = setInterval(() => {
    showCursor.value = !showCursor.value
  }, 530)

  let i = 0
  const baseSpeed = 22 // ms per character — fast but readable

  function typeNext() {
    if (i >= totalChars.value) {
      // Done typing
      isTypingDone.value = true
      showCursor.value = false
      if (cursorInterval) clearInterval(cursorInterval)

      // Success animation after a beat
      setTimeout(() => { showSuccess.value = true }, 300)
      return
    }

    const c = flatChars.value[i]
    typedLength.value = i + 1
    i++

    // Variable speed: newlines and spaces are fast, code is normal
    let delay = baseSpeed
    if (c.char === '\n') {
      delay = 80 // pause between lines
    } else if (c.char === ' ' && !c.cls) {
      delay = 10 // whitespace is instant
    }

    setTimeout(typeNext, delay)
  }

  // Small delay before starting
  setTimeout(typeNext, 600)
}

// IntersectionObserver to start typing when code block is visible
const codeRef = ref<HTMLElement | null>(null)

onMounted(() => {
  if (!codeRef.value) return

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        startTyping()
        observer.disconnect()
      }
    },
    { threshold: 0.3 }
  )
  observer.observe(codeRef.value)
})

const features = [
  {
    icon: Blocks,
    title: '13 Sandboxed APIs',
    description: 'Storage, database, sessions, AI, filesystem, HTTP, cron, CLI endpoints, sidebar, toasts, settings, events, and logging.'
  },
  {
    icon: Terminal,
    title: 'CLI Toolchain',
    description: 'Scaffold, build, validate, package, and publish plugins with a single command-line tool.'
  },
  {
    icon: Zap,
    title: 'Dev Shell',
    description: 'Electron-based development environment with mock APIs and hot-reload.'
  },
  {
    icon: FileCode,
    title: 'Manifest v2',
    description: 'Type-safe plugin manifest with Zod validation, permissions, migrations, and backend lifecycle.'
  },
  {
    icon: Store,
    title: 'Marketplace',
    description: 'Publish plugins to the AMC Marketplace with GitHub authentication and automated review.'
  },
  {
    icon: LayoutTemplate,
    title: 'Three Templates',
    description: 'Start from basic (UI only), with-backend, or full (UI + backend + cron + CLI).'
  }
]
</script>

<template>
  <div class="home-container">
    <!-- Hero -->
    <section class="hero">
      <div class="hero-content">
        <div class="hero-text">
          <span class="hero-brand">AMC PLUGIN SDK</span>
          <h1 class="hero-headline">
            Build plugins for<br />Agent Mission Control
          </h1>
          <p class="hero-tagline">
            Type-safe APIs, CLI toolchain, dev shell with hot-reload
          </p>
          <div class="hero-actions">
            <a href="/amc-plugin-sdk/guide/quickstart.html" class="btn-primary">
              Get Started
            </a>
            <a href="/amc-plugin-sdk/api/" class="btn-ghost">
              API Reference
            </a>
          </div>
        </div>

        <div class="hero-code-wrapper" ref="codeRef">
          <div class="hero-code" :class="{ 'typing-done': showSuccess }">
            <div class="code-titlebar">
              <div class="code-dots">
                <span class="dot dot-red" />
                <span class="dot dot-yellow" />
                <span class="dot dot-green" />
              </div>
              <span class="code-filename">my-plugin.ts</span>
              <Transition name="success-badge">
                <span v-if="showSuccess" class="code-success">
                  <Check :size="14" :stroke-width="2.5" />
                  Ready
                </span>
              </Transition>
            </div>
            <pre class="code-body"><code><span v-html="visibleHtml" /><span v-if="!isTypingDone && hasStartedTyping" class="cursor" :class="{ blink: showCursor }">|</span></code></pre>
          </div>
        </div>
      </div>
    </section>

    <!-- Divider -->
    <div class="section-divider" />

    <!-- Features -->
    <section class="features-section">
      <div class="features-header">
        <h2 class="features-title">Everything you need</h2>
        <p class="features-subtitle">to build production plugins</p>
      </div>
      <div class="features-grid">
        <div v-for="feature in features" :key="feature.title" class="feature-card">
          <div class="feature-icon">
            <component :is="feature.icon" :size="20" :stroke-width="1.5" />
          </div>
          <h3 class="feature-card-title">{{ feature.title }}</h3>
          <p class="feature-card-desc">{{ feature.description }}</p>
        </div>
      </div>
    </section>

    <!-- Install Badge -->
    <section class="install-section">
      <button class="install-pill" @click="copyInstall" :class="{ copied }">
        <span v-if="!copied" class="install-text">
          <span class="install-dollar">$</span>
          npm install -g @agent-mc/plugin-cli
        </span>
        <span v-else class="install-copied">Copied!</span>
      </button>
    </section>
  </div>
</template>

<style scoped>
.home-container {
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 24px;
}

/* Hero */
.hero {
  padding: 80px 0 64px;
}
.hero-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: center;
}
.hero-brand {
  display: inline-block;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  background: linear-gradient(135deg, #7c5cfc, #38bdf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 16px;
}
.hero-headline {
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1.15;
  color: #ededef;
  margin: 0 0 16px;
  letter-spacing: -0.02em;
}
.hero-tagline {
  font-size: 1.125rem;
  color: #8b8b8e;
  margin: 0 0 32px;
  line-height: 1.5;
}
.hero-actions {
  display: flex;
  gap: 12px;
}
.btn-primary {
  display: inline-flex;
  align-items: center;
  padding: 10px 24px;
  background: #7c5cfc;
  color: #fff;
  border-radius: 8px;
  font-size: 0.9375rem;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.2s ease;
}
.btn-primary:hover {
  background: #6a4ce0;
  box-shadow: 0 0 16px rgba(124, 92, 252, 0.3);
}
.btn-ghost {
  display: inline-flex;
  align-items: center;
  padding: 10px 24px;
  background: transparent;
  color: #ededef;
  border: 1px solid #1e1e22;
  border-radius: 8px;
  font-size: 0.9375rem;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.2s ease;
}
.btn-ghost:hover {
  border-color: #2a2a30;
  background: #141416;
}

/* Code Block */
.hero-code-wrapper {
  perspective: 1200px;
}
.hero-code {
  background: #141416;
  border: 1px solid #1e1e22;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(124, 92, 252, 0.06);
  transition: border-color 0.6s ease, box-shadow 0.6s ease;
}
.hero-code.typing-done {
  border-color: rgba(40, 200, 64, 0.3);
  box-shadow: 0 0 40px rgba(40, 200, 64, 0.08), 0 0 80px rgba(40, 200, 64, 0.04);
}
.code-titlebar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #1e1e22;
  background: #111113;
}
.code-dots {
  display: flex;
  gap: 6px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dot-red { background: #ff5f57; }
.dot-yellow { background: #ffbd2e; }
.dot-green { background: #28c840; }
.code-filename {
  font-size: 0.8125rem;
  color: #55555a;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace;
}

/* Success badge in titlebar */
.code-success {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 600;
  color: #28c840;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace;
}
.success-badge-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.success-badge-leave-active {
  transition: all 0.2s ease;
}
.success-badge-enter-from {
  opacity: 0;
  transform: scale(0.5) translateY(4px);
}
.success-badge-leave-to {
  opacity: 0;
}

.code-body {
  padding: 20px;
  margin: 0;
  overflow-x: auto;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace;
  font-size: 0.8125rem;
  line-height: 1.7;
  color: #ededef;
  background: transparent;
  /* 14 lines × 13px font × 1.7 line-height + 40px padding — prevents
     hero section from growing as typing animation progresses */
  min-height: 350px;
}
.code-body code {
  font-family: inherit;
}

/* Cursor */
.cursor {
  color: #7c5cfc;
  font-weight: 300;
  animation: none;
}
.cursor.blink {
  opacity: 1;
}
.cursor:not(.blink) {
  opacity: 0;
}

/* Syntax tokens */
:deep(.tok-keyword) { color: #c084fc; }
:deep(.tok-string) { color: #86efac; }
:deep(.tok-fn) { color: #93c5fd; }
:deep(.tok-prop) { color: #ededef; }
:deep(.tok-param) { color: #fbbf24; }
:deep(.tok-interp) { color: #fbbf24; }

/* Divider */
.section-divider {
  height: 1px;
  background: #1e1e22;
  margin: 0;
}

/* Features */
.features-section {
  padding: 64px 0;
}
.features-header {
  text-align: center;
  margin-bottom: 40px;
}
.features-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #ededef;
  margin: 0 0 8px;
}
.features-subtitle {
  font-size: 1.1rem;
  color: #8b8b8e;
  margin: 0;
}
.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.feature-card {
  background: #141416;
  border: 1px solid #1e1e22;
  border-radius: 12px;
  padding: 24px;
  transition: all 0.2s ease;
}
.feature-card:hover {
  border-color: #2a2a30;
  box-shadow: 0 0 20px rgba(124, 92, 252, 0.08);
}
.feature-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(124, 92, 252, 0.1);
  color: #7c5cfc;
  margin-bottom: 16px;
}
.feature-card-title {
  font-size: 1rem;
  font-weight: 600;
  color: #ededef;
  margin: 0 0 8px;
}
.feature-card-desc {
  font-size: 0.875rem;
  color: #8b8b8e;
  margin: 0;
  line-height: 1.5;
}

/* Install Badge */
.install-section {
  padding: 32px 0 64px;
  display: flex;
  justify-content: center;
}
.install-pill {
  display: inline-flex;
  align-items: center;
  padding: 12px 24px;
  background: #141416;
  border: 1px solid #1e1e22;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace;
  font-size: 0.875rem;
  color: #ededef;
}
.install-pill:hover {
  border-color: #2a2a30;
  box-shadow: 0 0 16px rgba(124, 92, 252, 0.08);
}
.install-pill.copied {
  border-color: #28c840;
}
.install-dollar {
  color: #55555a;
  margin-right: 8px;
  user-select: none;
}
.install-copied {
  color: #28c840;
}

/* Responsive */
@media (max-width: 959px) {
  .hero-content {
    grid-template-columns: 1fr;
    gap: 40px;
  }
  .features-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 639px) {
  .hero {
    padding: 48px 0 40px;
  }
  .hero-headline {
    font-size: 1.875rem;
  }
  .features-grid {
    grid-template-columns: 1fr;
  }
  .code-body {
    min-height: 350px;
  }
}
</style>
