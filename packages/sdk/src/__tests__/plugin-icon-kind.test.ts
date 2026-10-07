import { describe, it, expect } from 'vitest'
import { classifyPluginIcon } from '../validators/plugin-icon-kind'

/**
 * `classifyPluginIcon` is the only thing standing between a manifest's `icon`
 * string and three very different host behaviours: render the packaged file,
 * render a stock Lucide glyph, or refuse the value outright. `validate` branches
 * on all four kinds -- and the `unsafe-path` branch is the CLI's only guard
 * against a manifest pointing the extractor outside its own package -- so each
 * kind is pinned here by shape rather than by example.
 */
describe('classifyPluginIcon', () => {
  describe('absent or blank values fall back to the stock glyph', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['empty string', ''],
      ['whitespace only', '   '],
    ])('treats %s as lucide-name', (_label, value) => {
      expect(classifyPluginIcon(value)).toBe('lucide-name')
    })
  })

  describe('http(s) URLs are their own kind', () => {
    it.each([
      'http://example.com/logo.png',
      'https://example.com/logo.svg',
      'HTTPS://EXAMPLE.COM/logo.png',
      'https://example.com/no-extension',
    ])('classifies %s as url', value => {
      expect(classifyPluginIcon(value)).toBe('url')
    })
  })

  describe('anything that could escape the package is unsafe', () => {
    it.each([
      ['a non-http scheme', 'file:///etc/passwd'],
      ['a data URI', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
      ['a script scheme', 'javascript:alert(1)'],
      ['a Windows drive letter', 'C:\\Users\\me\\icon.png'],
      ['a backslash separator', 'assets\\icon.svg'],
      ['an absolute POSIX path', '/etc/icon.png'],
      ['a bare parent segment', '..'],
      ['a leading traversal', '../../secrets/icon.svg'],
      ['a traversal in the middle', 'assets/../../icon.svg'],
    ])('rejects %s', (_label, value) => {
      expect(classifyPluginIcon(value)).toBe('unsafe-path')
    })
  })

  describe('paths into the package', () => {
    it.each([
      'assets/icon.svg',
      'assets/nested/deep/logo.webp',
      'icon.png',
      'logo.JPEG',
      'brand.gif',
      'photo.jpg',
    ])('classifies %s as packaged-path', value => {
      expect(classifyPluginIcon(value)).toBe('packaged-path')
    })

    it('treats a directory-qualified name as a path even without a known extension', () => {
      // The `/` alone is the signal -- a slash can never appear in a Lucide name.
      expect(classifyPluginIcon('assets/icon')).toBe('packaged-path')
    })
  })

  describe('Lucide icon names', () => {
    it.each(['newspaper', 'puzzle', 'file-text', 'banana'])(
      'classifies %s as lucide-name',
      value => {
        expect(classifyPluginIcon(value)).toBe('lucide-name')
      },
    )

    it('does not mistake a dotted name for a traversal', () => {
      // `..` is only a traversal when it is a whole path SEGMENT.
      expect(classifyPluginIcon('my..icon')).toBe('lucide-name')
    })
  })

  describe('surrounding whitespace is ignored, not classified', () => {
    it.each([
      ['  newspaper  ', 'lucide-name'],
      ['  assets/icon.svg  ', 'packaged-path'],
      ['  ../escape.svg  ', 'unsafe-path'],
      ['  https://example.com/a.png  ', 'url'],
    ])('classifies %j as %s', (value, expected) => {
      expect(classifyPluginIcon(value)).toBe(expected)
    })
  })
})
