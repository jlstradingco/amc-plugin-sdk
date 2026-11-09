# RSS

Fetch any RSS or Atom feed, list the feeds the user follows in Omniscio, and read the articles Omniscio has already collected.

**Availability:** Backend (`ctx.rss`). The SDK does not type an `Omniscio.rss` for the webview.
**Required Permission:** `rss`

::: tip Read-only
`ctx.rss` has three methods and all of them only read. A plugin cannot add, change or remove the user's feeds.
:::

`ctx.rss` is optional on `PluginContext`, so check it before use.

## Permissions

`rss` is a standard permission. Omniscio shows it to the user as "RSS: Read RSS feeds and your curated feed entries".

```json
{
  "permissions": ["rss"]
}
```

## Methods

### `fetchFeed(url: string): Promise<PluginRssFeedResult>`

Fetch and parse a feed from any address.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `url` | `string` | The feed address, up to 2000 characters |

**Returns:** `Promise<PluginRssFeedResult>`

**Rejects** when the address is refused, the server answers with an error, or the page is not a feed. Private and internal network addresses are blocked, every redirect is checked again, and a slow server is cut off after 15 seconds.

---

### `listFeeds(): Promise<PluginRssFeed[]>`

The feeds the user follows in Omniscio.

**Returns:** `Promise<PluginRssFeed[]>`

---

### `getRecentEntries(options?: PluginRssRecentOptions): Promise<PluginRssEntry[]>`

Articles Omniscio has already collected from the user's feeds.

**Returns:** `Promise<PluginRssEntry[]>`

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `options.sinceDays` | `number` | How many days back to look, 1 to 90. Defaults to 7. Ignored when `feedId` is set |
| `options.feedId` | `string` | Only entries of this one feed |
| `options.limit` | `number` | At most this many entries, 1 to 200. Only applied together with `feedId` |

## Types

```typescript
interface PluginRssParsedEntry {
  id: string
  title: string
  link?: string
  content?: string
  contentSnippet?: string
  /** The publication date as the feed wrote it. */
  pubDate?: string
  author?: string
  categories?: string[]
}

interface PluginRssFeedResult {
  title: string
  description?: string
  link?: string
  entries: PluginRssParsedEntry[]
}

interface PluginRssFeed {
  id: string
  url: string
  name: string
  lastFetchedAt: string | null
  lastEntryAt: string | null
  unreadCount: number
  refreshIntervalMin: number
  errorMessage: string | null
  createdAt: string
}

interface PluginRssEntry {
  id: string
  feedId: string
  guid: string
  title: string
  link: string | null
  content: string | null
  author: string | null
  publishedAt: string | null
  isRead: boolean
  isArchived: boolean
  createdAt: string
  fetchedContent: string | null
  aiSummary: string | null
  wasClicked: boolean
  readDurationMs: number | null
}

interface PluginRssRecentOptions {
  sinceDays?: number
  feedId?: string
  limit?: number
}
```

## Example

```typescript
import type { PluginContext } from '@omniscio/plugin-sdk'

export async function activate(ctx: PluginContext) {
  async function weeklyHeadlines(): Promise<string[]> {
    if (!ctx.rss) return []

    const recent = await ctx.rss.getRecentEntries({ sinceDays: 7 })
    const unread = recent.filter((entry) => !entry.isRead)
    return unread.map((entry) => entry.title)
  }

  async function previewFeed(url: string) {
    try {
      const feed = await ctx.rss?.fetchFeed(url)
      return feed ? feed.entries.slice(0, 5).map((e) => e.title) : []
    } catch {
      ctx.log.warn('That address did not return a readable feed')
      return []
    }
  }

  return {}
}
```

## Notes

- `PluginRssEntry` entries are read from what Omniscio has already collected; they are not fetched live. Use `fetchFeed` for a live read of a single address.
- Your plugin cannot subscribe the user to a feed. Ask the user to add it in Omniscio.
