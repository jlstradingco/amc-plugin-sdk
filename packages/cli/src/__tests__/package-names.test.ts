import { describe, it, expect } from 'vitest'
import { DEV_SHELL_PACKAGE_NAMES, SDK_PACKAGE_NAMES, firstResolved } from '../lib/package-names.js'

describe('package names', () => {
  it('tries the Omniscio name before the old @agent-mc one', () => {
    expect(SDK_PACKAGE_NAMES).toEqual(['@omniscio/plugin-sdk', '@agent-mc/plugin-sdk'])
    expect(DEV_SHELL_PACKAGE_NAMES).toEqual(['@omniscio/plugin-dev-shell', '@agent-mc/plugin-dev-shell'])
  })
})

describe('firstResolved', () => {
  const installed = (present: Record<string, string>) => (name: string) => present[name] ?? null

  it('picks the new name when both are installed', () => {
    const lookup = installed({ '@omniscio/plugin-sdk': '3.4.0', '@agent-mc/plugin-sdk': '3.3.0' })
    expect(firstResolved(SDK_PACKAGE_NAMES, lookup)).toEqual({ name: '@omniscio/plugin-sdk', value: '3.4.0' })
  })

  it('falls back to the old name for a plugin created before the rename', () => {
    const lookup = installed({ '@agent-mc/plugin-dev-shell': '/x/shell-window.js' })
    expect(firstResolved(DEV_SHELL_PACKAGE_NAMES, lookup)).toEqual({
      name: '@agent-mc/plugin-dev-shell',
      value: '/x/shell-window.js'
    })
  })

  it('answers null when neither is installed', () => {
    expect(firstResolved(SDK_PACKAGE_NAMES, installed({}))).toBeNull()
  })
})
