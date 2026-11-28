import { describe, it, expect } from 'vitest'
import { validateManifest } from '../validators/manifest.js'
import type { PluginManifest } from '../types/manifest.js'

const baseManifest = {
  plugin: {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    author: 'Test Author',
    description: 'A test plugin',
    icon: 'zap',
    category: 'productivity',
    license: { type: 'free' },
  },
  settings: [],
  storage: { collections: {} },
  sdkVersion: '2.0.0',
} satisfies PluginManifest

const withHelp = (help: unknown) => ({ ...baseManifest, help })
const errorsOf = (manifest: unknown): string => validateManifest(manifest).errors.join('\n')

describe('manifest help block (mirrors the host help schema)', () => {
  it('accepts web articles and Omniscio Shares videos', () => {
    const manifest = withHelp({
      articles: [{ title: 'Getting started', url: 'https://example.com/start' }],
      videos: [{ title: 'Tour', url: 'https://shares.omniscio.com/s/abc123' }],
    }) satisfies PluginManifest
    expect(errorsOf(manifest)).toBe('')
  })

  it('refuses a video hosted anywhere but Omniscio Shares, as the app does', () => {
    expect(errorsOf(withHelp({ videos: [{ title: 'Tour', url: 'https://vimeo.com/1' }] }))).toContain(
      'Omniscio Shares video links',
    )
  })

  it('refuses a Shares address with no video token', () => {
    expect(errorsOf(withHelp({ videos: [{ title: 'Tour', url: 'https://shares.omniscio.com/' }] }))).not.toBe('')
  })

  it('refuses an article that is not an http or https link', () => {
    expect(errorsOf(withHelp({ articles: [{ title: 'Bad', url: 'javascript:alert(1)' }] }))).not.toBe('')
  })

  it('refuses more than ten entries and an empty title', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ title: `A${i}`, url: `https://example.com/${i}` }))
    expect(errorsOf(withHelp({ articles: many }))).not.toBe('')
    expect(errorsOf(withHelp({ articles: [{ title: ' ', url: 'https://example.com' }] }))).not.toBe('')
  })
})
