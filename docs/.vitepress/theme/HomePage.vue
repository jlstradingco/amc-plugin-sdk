<script setup lang="ts">
import { ref } from 'vue'
import {
  Blocks,
  Terminal,
  Zap,
  FileCode,
  Store,
  LayoutTemplate
} from 'lucide-vue-next'

const copied = ref(false)

function copyInstall() {
  navigator.clipboard.writeText('npm install -g @amc/plugin-cli')
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

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
            <a href="/amc-plugin-sdk/guide/getting-started.html" class="btn-primary">
              Get Started
            </a>
            <a href="/amc-plugin-sdk/api/" class="btn-ghost">
              API Reference
            </a>
          </div>
        </div>

        <div class="hero-code-wrapper">
          <div class="hero-code">
            <div class="code-titlebar">
              <div class="code-dots">
                <span class="dot dot-red" />
                <span class="dot dot-yellow" />
                <span class="dot dot-green" />
              </div>
              <span class="code-filename">my-plugin.ts</span>
            </div>
            <pre class="code-body"><code><span class="tok-keyword">import</span> { <span class="tok-fn">definePlugin</span> } <span class="tok-keyword">from</span> <span class="tok-string">'@amc/plugin-sdk'</span>

<span class="tok-keyword">export default</span> <span class="tok-fn">definePlugin</span>({
  <span class="tok-prop">name</span>: <span class="tok-string">'my-plugin'</span>,
  <span class="tok-prop">version</span>: <span class="tok-string">'1.0.0'</span>,

  <span class="tok-prop">backend</span>: {
    <span class="tok-fn">onSessionEvent</span>({ <span class="tok-param">sessions</span>, <span class="tok-param">toast</span> }) {
      sessions.<span class="tok-fn">onStatusChange</span>(<span class="tok-string">'needs_you'</span>, (<span class="tok-param">session</span>) =&gt; {
        toast.<span class="tok-fn">show</span>(<span class="tok-string">`Attention: <span class="tok-interp">${session.name}</span>`</span>)
      })
    }
  }
})</code></pre>
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
          npm install -g @amc/plugin-cli
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
  transform: rotateY(-2deg);
  transition: transform 0.3s ease;
}
.hero-code:hover {
  transform: rotateY(0deg);
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
.code-body {
  padding: 20px;
  margin: 0;
  overflow-x: auto;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace;
  font-size: 0.8125rem;
  line-height: 1.7;
  color: #ededef;
  background: transparent;
}
.code-body code {
  font-family: inherit;
}

/* Syntax tokens */
.tok-keyword { color: #c084fc; }
.tok-string { color: #86efac; }
.tok-fn { color: #93c5fd; }
.tok-prop { color: #ededef; }
.tok-param { color: #fbbf24; }
.tok-interp { color: #fbbf24; }

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
  .hero-code {
    transform: none;
  }
  .hero-code:hover {
    transform: none;
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
}
</style>
