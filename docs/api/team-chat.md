# Team Chat

Read the Team Chat channels and direct messages the user picks for your plugin, search inside them, and post, reply, react and send direct messages there after the user approves each one.

**Availability:** The picker is in the panel (`Omniscio.teamChat.requestAccess()`); every read is backend only (`ctx.teamChat`). A panel read is refused; reach it from your UI through `backend.invoke`.
**Required Permission:** `teamChat.read` for reads; `teamChat.write` for posting, which **requires** `teamChat.read` in the same manifest.

::: tip Your plugin reads as the user
Every read runs with the user's own sign-in, so your plugin never sees a conversation the user is not in. It sees only the conversations the user picked, or every conversation they are in when they chose "All, including new ones".
:::

::: tip Available when the person turns it on
The Team Chat API is available when the person has turned on **Plugin access to Team Chat** in Labs, Team Chat is on and they are signed in. Until then, every call rejects with "This feature is not available."
:::

## Permissions

Both permissions are elevated. Omniscio describes them to the user as "Team Chat: Read the Team Chat channels and direct messages you pick, and search inside them." and "Post in Team Chat: Post, reply, react and send direct messages in the channels you pick, after you approve each one."

```json
{
  "permissions": ["teamChat.read", "teamChat.write"]
}
```

A manifest that lists `teamChat.write` without `teamChat.read` is rejected.

## Choosing conversations (panel)

### `Omniscio.teamChat.requestAccess(): Promise<PluginTeamChatAccessOutcome>`

Opens Omniscio's own picker. The user ticks single channels and direct messages, or **All, including new ones**, which also covers conversations they join later. Below the list they choose how your plugin's posts will appear: under their name, labeled "sent by" your plugin (`'agent'`, the default), or as its own card named after your plugin (`'card'`).

**Returns:** what your plugin holds after the picker closes, including on cancel.

## Backend methods

Each method is on `ctx.teamChat`. Reads are limited to 60 a minute per plugin, shared with the other work-data reads; a faster call rejects with `RATE_LIMITED`. Every read is written to the host's read log, which the user can review. A channel your plugin was not given rejects with "That channel is not available." A read that fails for an unexpected reason rejects with "Something went wrong. Try again."

Channel and message ids are 1 to 128 letters, digits, dashes, underscores or colons; anything else is rejected before any read.

### `channels.list(): Promise<PluginTeamChatChannel[]>`

The picked conversations the user is still in, with their current names. With "All, including new ones", every conversation they are in.

### `messages.list(channelId: string, query?: PluginTeamChatMessagesQuery): Promise<PluginTeamChatMessagesPage>`

One page of messages, newest first.

| Name | Type | Description |
|---|---|---|
| `query.before` | `string` | The `nextBefore` of the previous page, to read further back |
| `query.limit` | `number` | 1 to 100, default 25 |

### `threads.list(channelId: string, messageId: string): Promise<PluginTeamChatThreadPage>`

The replies to one message, oldest first, up to 500; `capped` is true when there were more.

### `unread(channelId: string): Promise<PluginTeamChatUnread>`

How many messages the user has not read in the conversation, and when they last read it.

### `search(query: string, options?: PluginTeamChatSearchOptions): Promise<PluginTeamChatSearchHit[]>`

Searches the user's Team Chat and returns only hits from the picked conversations, at most `options.limit` (1 to 20, default 20). The text must not be blank and is at most 500 characters.

## Posting (backend)

Each posting method needs `teamChat.write`, runs in your backend only, and works only in a
conversation the user picked (or anywhere they are, with "All, including new ones"). Before anything
is sent, Omniscio shows the user its own dialog with your plugin's name, the channel or person, how
the post will appear, and the whole text; only their "yes" lets it through. The user can turn each
of the four asks (post, reply, react, direct message) off in Settings, Plugins; your plugin cannot.

Posting methods never reject for an expected refusal. They answer a result you check:

```typescript
type PluginWriteResult<T> = { ok: true; value: T } | { ok: false; code: PluginWriteCode }
```

| Code | Meaning |
|---|---|
| `FEATURE_OFF` | Plugin access to Team Chat or Team Chat itself is off, or nobody is signed in |
| `NOT_FOUND` | The conversation was not picked (checked before the dialog), or the message is gone |
| `RATE_LIMITED` | More than 10 changes in a minute, shared with the other work-data changes |
| `DECLINED` | The user said no, closed the dialog, or no window could show it |
| `BUSY` | Your plugin already has a question open |
| `INVALID` | A card reply in a thread, or a direct message to the user themselves |
| `CONFLICT` | The user changed how your posts appear while the dialog was open |
| `FORBIDDEN` | Team Chat refused it (for example, the user may not post in that channel) |
| `FAILED` | Something unexpected went wrong |

Every change, and every refusal after the conversation was found, is written to the change log the
user can review.

### How your posts appear

The user picks it in the picker (`postAs` in `PluginTeamChatAccessOutcome`):

- **`'agent'` (default):** under the user's name, labeled "sent by" your plugin's display name.
- **`'card'`:** as your plugin's own card, named after your plugin. A card cannot reply in a thread:
  `messages.post` with a `threadId` answers `INVALID` ("This plugin posts as its own card, which
  cannot reply in a thread."). A card can go into a picked direct message conversation that already
  exists.

A reaction always comes from the user, whichever they picked.

### `messages.post(channelId: string, text: string, options?: PluginTeamChatPostOptions): Promise<PluginWriteResult<PluginTeamChatWritten>>`

Posts `text` (1 to 8,000 characters, not blank) in the channel. Pass `options.threadId`, the id of a
message, to reply in its thread. `value.id` is the new message's id.

### `messages.react(channelId: string, messageId: string, emoji: string): Promise<PluginWriteResult<PluginTeamChatWritten>>`

Adds a reaction (1 to 32 characters) to a message. `messages.unreact` takes the same arguments and
removes it. `value.id` is the message's id.

### `dm.send(memberUid: string, text: string): Promise<PluginWriteResult<PluginTeamChatWritten>>`

Sends a direct message to a teammate, in the conversation between the user and `memberUid`. It is
refused with `NOT_FOUND` unless the user picked that conversation or chose "All, including new
ones". Use the `authorUid` of a message you read to find the uid.

## Types

```typescript
interface PluginTeamChatChannel {
  id: string
  name: string
  kind: 'channel' | 'dm'
}

interface PluginTeamChatMessage {
  id: string
  authorUid: string
  authorName?: string
  text: string
  createdAt: string    // ISO 8601
  parentId?: string    // the message this one replies to
  isAgent: boolean     // posted by an agent or a plugin
  pluginLabel?: string // the plugin that posted it, when one did
}

interface PluginTeamChatMessagesPage {
  messages: PluginTeamChatMessage[]
  nextBefore: string | null
}

interface PluginTeamChatThreadPage {
  replies: PluginTeamChatMessage[]
  capped: boolean
}

interface PluginTeamChatUnread {
  unreadCount: number
  lastReadAt: string | null
}

interface PluginTeamChatSearchHit {
  messageId: string
  channelId: string
  authorUid: string
  text: string
  createdAt: string
}

interface PluginTeamChatAccessOutcome {
  cancelled: boolean
  allChannels: boolean
  channels: PluginTeamChatChannel[]
  postAs: 'agent' | 'card'
}

interface PluginTeamChatPostOptions {
  threadId?: string   // reply in this message's thread
}

interface PluginTeamChatWritten {
  id: string
}
```

Messages carry no mentions, reactions, attachments or the internals of alert, call and bot messages.

## Example

```typescript
export async function activate(ctx: PluginContext) {
  const channels = await ctx.teamChat!.channels.list()
  for (const channel of channels) {
    const { unreadCount } = await ctx.teamChat!.unread(channel.id)
    if (unreadCount === 0) continue
    const page = await ctx.teamChat!.messages.list(channel.id, { limit: unreadCount })
    ctx.log.info(`${channel.name}: ${page.messages.length} new`)
  }
}
```

Posting a daily summary, and checking the answer:

```typescript
const result = await ctx.teamChat!.messages.post(channelId, 'Daily summary: 3 tasks done.')
if (!result.ok) ctx.log.warn(`Not posted: ${result.code}`)
```
