import type { AgentMC, WidgetShape, WidgetSpec, WidgetTone } from '@agent-mc/plugin-sdk/browser'

const amc = (window as unknown as { AgentMC: AgentMC }).AgentMC

const shapeEl = document.getElementById('shape') as HTMLSelectElement
const toneEl = document.getElementById('tone') as HTMLSelectElement
const progressEl = document.getElementById('progress') as HTMLInputElement
const statusEl = document.getElementById('status')!

// A short, fixed series for the sparkline shape (up to 32 finite numbers).
const SERIES = [3, 5, 4, 8, 6, 9, 7, 12]

// You send DATA and Omniscio draws it. `value` is capped at 8 characters and `label`
// at 16 by the host (an anti-phishing limit), and `icon` is a NAME from Omniscio's
// allow-list, never an image. The tone is a meaning, not a colour.
function buildSpec(): WidgetSpec {
  const progress = Number(progressEl.value) / 100
  return {
    shape: shapeEl.value as WidgetShape,
    value: `${Math.round(progress * 100)}%`,
    label: 'widget demo',
    tone: toneEl.value as WidgetTone,
    icon: 'Sparkles',
    tooltip: 'Pushed from the Widget Demo plugin',
    progress,
    series: SERIES,
  }
}

async function show(): Promise<void> {
  try {
    await amc.widget.set(buildSpec())
    statusEl.textContent = 'Widget updated.'
  } catch (err) {
    statusEl.textContent = `Could not update the widget: ${err instanceof Error ? err.message : String(err)}`
  }
}

async function clear(): Promise<void> {
  try {
    await amc.widget.clear()
    statusEl.textContent = 'Widget cleared.'
  } catch (err) {
    statusEl.textContent = `Could not clear the widget: ${err instanceof Error ? err.message : String(err)}`
  }
}

document.getElementById('btn-show')!.addEventListener('click', show)
document.getElementById('btn-clear')!.addEventListener('click', clear)

// Show something straight away, so the titlebar is not empty after enabling.
void show()
