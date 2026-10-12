import { createCommandChannel, defineCommand } from '../../commands/index.js'
import type { PluginActivate } from '../../types/backend.js'

// Fixture plugins for the forged-rows self-test. Every one takes its "send" command through the
// command channel. All but `none` ALSO keep one legacy way of running rows from the `commands`
// table — the hole Edo's four plugins shipped — so the check must catch them, or it is a rubber
// stamp.

export const MAIL_MANIFEST = {
  storage: {
    collections: {
      jobs: { columns: { label: 'text', status: 'text', error: 'text' } },
      commands: { columns: { type: 'text', payload: 'json', status: 'text' } },
    },
  },
}

export const MAIL_COMMANDS = [{ type: 'send', input: { to: 'ada@example.test' } }]

/** `storage`: runs, at start-up, every command record it finds in ctx.storage — the shape of the
 *  old durable channel's resume, which any agent could feed through the host's kv routes. */
export type Drain = 'none' | 'cron' | 'on-command' | 'start-up' | 'timer' | 'storage'

/** A mail plugin on the command channel, plus the legacy row drain named by `drain`. */
export function mailPlugin(drain: Drain): PluginActivate {
  return (ctx) => {
    const send = async (to: string) => {
      await ctx.http.fetch(`https://mail.example.test/send?to=${encodeURIComponent(to)}`, { method: 'POST' })
    }
    const drainRows = async () => {
      for (const row of await ctx.db.query('commands', { where: { status: 'pending' } })) {
        await send(String((row.payload as { to?: unknown } | null)?.to ?? ''))
        await ctx.db.update('commands', String(row.id), { status: 'done' })
      }
    }
    const drainStorage = async () => {
      for (const { key, value } of await ctx.storage.list('__commands:mail:')) {
        await send(String((value as { input?: { to?: unknown } } | null)?.input?.to ?? ''))
        await ctx.storage.delete(key)
      }
    }
    const channel = createCommandChannel(ctx, {
      name: 'mail',
      commands: {
        send: defineCommand({
          parse: (input: unknown) => {
            const to = (input as { to?: unknown } | null)?.to
            if (typeof to !== 'string') throw new Error('to must be a string')
            return { to }
          },
          run: async ({ to }) => {
            await send(to)
            await ctx.db.insert('jobs', { label: `send ${to}`, status: 'done', error: '' })
            if (drain === 'on-command') await drainRows()
            return { sent: true }
          },
        }),
      },
    })
    let timer: ReturnType<typeof setInterval> | undefined
    return {
      async onEnable() {
        await channel.retireRows('commands')
        await ctx.cron.register('tick', '*/5 * * * *', async () => {
          await ctx.storage.set('lastTick', 'tick')
        })
        if (drain === 'cron') await ctx.cron.register('drain', '* * * * *', drainRows)
        if (drain === 'timer') timer = setInterval(() => void drainRows(), 30_000)
      },
      async onAppReady() {
        if (drain === 'start-up') await drainRows()
        if (drain === 'storage') await drainStorage()
      },
      onDisable() {
        if (timer) clearInterval(timer)
      },
    }
  }
}

/** A table that holds 150 rows the plugin wrote itself; `origin` marks them, and has no role. */
export const HISTORY_MANIFEST = {
  storage: {
    collections: {
      history: { columns: { type: 'text', payload: 'json', status: 'text', origin: 'text' } },
    },
  },
}

export const HISTORY_ROWS = 150

/** What the recording plugin saw: its own rows at each start, and those re-armed at each audit. */
export interface HistorySightings {
  atStart: number[]
  rearmed: number[]
}

/**
 * A SAFE plugin (it never acts on a row) that records how many of its own rows it can see, so a
 * test can tell whether the forged-rows check really edited every row and restarted on all of
 * them — the check once read only the host's first page of 100.
 */
export function historyPlugin(seen: HistorySightings): PluginActivate {
  return (ctx) => {
    const ownRows = async (where: Record<string, unknown>) =>
      (await ctx.db.query('history', { where: { origin: 'seed', ...where }, limit: 1000 })).length
    createCommandChannel(ctx, {
      name: 'mail',
      commands: {
        send: defineCommand({
          parse: (input: unknown) => String((input as { to?: unknown } | null)?.to ?? ''),
          run: async (to) => {
            await ctx.http.fetch(`https://mail.example.test/send?to=${encodeURIComponent(to)}`, { method: 'POST' })
            return { sent: true }
          },
        }),
      },
    })
    return {
      async onEnable() {
        if ((await ownRows({})) === 0) {
          for (let n = 0; n < HISTORY_ROWS; n++) {
            await ctx.db.insert('history', { type: 'note', payload: null, status: 'done', origin: 'seed' })
          }
        }
        seen.atStart.push(await ownRows({}))
        await ctx.cron.register('audit', '* * * * *', async () => {
          seen.rearmed.push(await ownRows({ status: 'pending' }))
        })
      },
    }
  }
}
