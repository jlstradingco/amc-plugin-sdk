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

export type Drain = 'none' | 'cron' | 'on-command' | 'start-up' | 'timer'

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
      },
      onDisable() {
        if (timer) clearInterval(timer)
      },
    }
  }
}
