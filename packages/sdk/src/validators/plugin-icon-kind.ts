/**
 * What KIND of thing a plugin manifest's `icon` field actually holds.
 *
 * The field accepts two legitimate but visually opposite forms, and nothing told them apart:
 *   - `assets/icon.svg` — a path into your package. The marketplace extracts that file on
 *     upload and serves it, so Omniscio draws YOUR LOGO.
 *   - `newspaper`       — a Lucide icon name, so Omniscio draws a generic stock glyph.
 *
 * The schema is `z.string().min(1)`, so `newspaper`, `assets/icon.svg` and `banana` all
 * validate identically and nothing ever said which one you were choosing. Measured on the
 * live registry 2026-09-21: 16 of 17 published plugins shipped a stock glyph, several of
 * them while carrying a perfectly good logo inside their own package.
 *
 * MIRROR: Omniscio carries its own copy of `classifyPluginIcon` at
 * `src/shared/plugin-icon-kind.ts`. The host file is not a byte-for-byte copy (it adds
 * `isRenderableIconUrl`), but `classifyPluginIcon` itself must match this one. There is no
 * import boundary between this SDK and that host, so the two must be kept in step by hand —
 * the same parity obligation the marketplace permission list already lives under. If you
 * change the classification rules here, change them there.
 */
export type PluginIconKind = 'url' | 'packaged-path' | 'lucide-name' | 'unsafe-path'

/** Extensions the marketplace's upload path recognises when extracting a packaged icon. */
const PACKAGED_ICON_EXT = /\.(svg|png|jpe?g|gif|webp)$/i

/** `http://` / `https://` — the ONLY schemes the host will ever render as an image. */
const HTTP_SCHEME = /^https?:\/\//i

/** Any `scheme:` prefix at all. Also catches a Windows drive letter (`C:\…`). */
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** Classify a plugin icon value by its SHAPE. */
export function classifyPluginIcon(value: string | null | undefined): PluginIconKind {
  const v = value?.trim()
  if (!v) return 'lucide-name'

  if (HTTP_SCHEME.test(v)) return 'url'
  if (ANY_SCHEME.test(v)) return 'unsafe-path'
  if (v.includes('\\') || v.startsWith('/')) return 'unsafe-path'
  if (v.split('/').includes('..')) return 'unsafe-path'

  if (v.includes('/') || PACKAGED_ICON_EXT.test(v)) return 'packaged-path'
  return 'lucide-name'
}
