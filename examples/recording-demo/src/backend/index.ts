import type { PluginContext, PluginBackend, Recording } from '@agent-mc/plugin-sdk'

/**
 * Screen recording lives on the BACKEND, not the webview.
 *
 * This example used to drive `AgentMC.recording.*` straight from its UI. That
 * namespace does not exist on the webview bridge at all — the calls were
 * `undefined`, and the demo wrapped every one in a try/catch that reported
 * "recording is not yet available in this build", which hid the real cause for
 * as long as the example shipped.
 *
 * So the backend owns the capability and the webview drives it over the shared
 * event bus. That bus is the supported way to cross the two surfaces: an `emit`
 * from either side reaches subscribers on both.
 */
export default function activate(ctx: PluginContext): PluginBackend {
  const publish = async (): Promise<void> => {
    const recordings: Recording[] = await ctx.recording.list()
    ctx.events.emit('recording:list', { recordings })
  }

  return {
    onEnable() {
      // NOTE: `ctx.events.on` returns NOTHING on this surface — the host has no
      // unsubscribe wire protocol for the event bus, and its handler set is
      // append-only. So these subscriptions live until the worker exits and
      // there is deliberately nothing to tear down in onDisable.
      ctx.events.on('recording:start', async () => {
        // `start()` takes NO arguments: the host owns source selection, and it
        // raises a native confirm the plugin cannot bypass.
        const started = await ctx.recording.start()
        if (!started.ok) {
          // A refusal RESOLVES — recorder off, busy, rate-limited, or the user
          // dismissed the confirm. It is not a rejection, so there is nothing
          // to catch.
          ctx.events.emit('recording:error', { message: started.error })
          return
        }
        ctx.events.emit('recording:started', { recordingId: started.recordingId })
        await publish()
      })

      ctx.events.on('recording:stop', async (data) => {
        // `stop()` wants a BARE id string. Passing an object resolves
        // `{ ok: false }` silently, which is why this reads the id out first.
        const { recordingId } = (data ?? {}) as { recordingId?: string }
        if (!recordingId) return
        const stopped = await ctx.recording.stop(recordingId)
        if (!stopped.ok) {
          ctx.events.emit('recording:error', { message: stopped.error ?? 'stop failed' })
          return
        }
        ctx.events.emit('recording:stopped', { recordingId })
        await publish()
      })

      ctx.events.on('recording:refresh', () => {
        void publish()
      })

      void publish()
    }
  }
}
