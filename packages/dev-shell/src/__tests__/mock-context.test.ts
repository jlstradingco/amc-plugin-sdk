import { describe, it, expect, beforeEach } from 'vitest'
import { createMockContext } from '../mock-context'

describe('createMockContext', () => {
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext({ pluginId: 'test', pluginVersion: '1.0.0', logToConsole: false })
  })

  it('sets pluginId and version', () => {
    expect(ctx.pluginId).toBe('test')
    expect(ctx.pluginVersion).toBe('1.0.0')
  })

  it('storage get/set round-trips', async () => {
    await ctx.storage.set('key', { hello: 'world' })
    const val = await ctx.storage.get('key')
    expect(val).toEqual({ hello: 'world' })
  })

  it('storage delete removes key', async () => {
    await ctx.storage.set('key', 'val')
    await ctx.storage.delete('key')
    expect(await ctx.storage.get('key')).toBeUndefined()
  })

  it('storage list returns all keys', async () => {
    await ctx.storage.set('a', 1)
    await ctx.storage.set('b', 2)
    const items = await ctx.storage.list()
    expect(items).toHaveLength(2)
    expect(items.map(i => i.key).sort()).toEqual(['a', 'b'])
  })

  it('storage list filters by prefix', async () => {
    await ctx.storage.set('user:name', 'Steve')
    await ctx.storage.set('user:age', 30)
    await ctx.storage.set('config:theme', 'dark')
    const items = await ctx.storage.list('user:')
    expect(items).toHaveLength(2)
  })

  it('events emit and on work', () => {
    const received: unknown[] = []
    ctx.events.on('test-event', (data) => received.push(data))
    ctx.events.emit('test-event', { msg: 'hello' })
    expect(received).toEqual([{ msg: 'hello' }])
  })

  it('events on returns unsubscribe function', () => {
    const received: unknown[] = []
    const unsub = ctx.events.on('test', (data) => received.push(data))
    ctx.events.emit('test', 1)
    unsub()
    ctx.events.emit('test', 2)
    expect(received).toEqual([1])
  })

  it('log methods are callable', () => {
    expect(() => ctx.log.info('hello')).not.toThrow()
    expect(() => ctx.log.warn('warning')).not.toThrow()
    expect(() => ctx.log.error('error')).not.toThrow()
    expect(() => ctx.log.debug('debug')).not.toThrow()
  })

  it('sidebar setBadge and setItems are callable', () => {
    expect(() => ctx.sidebar.setBadge(5)).not.toThrow()
    expect(() => ctx.sidebar.setItems([{ id: '1', title: 'Test' }])).not.toThrow()
  })
})
