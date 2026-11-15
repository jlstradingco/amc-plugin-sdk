import { describe, it, expect, vi } from 'vitest'
import { validateSidebarItems, validateWidgetSpec } from '@omniscio/plugin-sdk'
import { createMockContext } from '../mock-context'
import { createPreviewState } from '../preview-state'

function build() {
  const notify = vi.fn()
  const preview = createPreviewState({
    widgets: [],
    validateWidgetSpec,
    validateSidebarItems,
    notify,
    throttleMs: 0,
  })
  const ctx = createMockContext({ pluginId: 'test', pluginVersion: '1.0.0', logToConsole: false, preview })
  return { ctx, preview, notify }
}

describe('createMockContext with a sidebar preview', () => {
  it('ctx.sidebar.setItems reaches the preview, keeping good rows and dropping a row without status', () => {
    const { ctx, preview } = build()
    ctx.sidebar.setItems([
      { id: 'scan', title: 'Dependency scan', status: 'running', progress: 80 },
      { id: 'broken', title: 'No status' } as never,
    ])
    const rows = preview.snapshot().rows
    expect(rows.kept).toEqual([{ id: 'scan', title: 'Dependency scan', status: 'running', progress: 80 }])
    expect(rows.dropped).toHaveLength(1)
    expect(rows.dropped[0]).toMatchObject({ index: 1, id: 'broken' })
  })

  it('ctx.sidebar.setBadge reaches the preview and notifies the shell', () => {
    const { ctx, preview, notify } = build()
    ctx.sidebar.setBadge(5)
    expect(preview.snapshot().badge).toBe(5)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('still logs the call when logging is on', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const preview = createPreviewState({
      widgets: [],
      validateWidgetSpec,
      validateSidebarItems,
      notify: () => undefined,
      throttleMs: 0,
    })
    const ctx = createMockContext({ pluginId: 'test', pluginVersion: '1.0.0', logToConsole: true, preview })
    ctx.sidebar.setItems([])
    expect(log).toHaveBeenCalledWith('[plugin:test] [sidebar] setItems(0 items)')
    log.mockRestore()
  })

  it('works as before when no preview is passed', () => {
    const ctx = createMockContext({ pluginId: 'test', pluginVersion: '1.0.0', logToConsole: false })
    expect(() => {
      ctx.sidebar.setBadge(1)
      ctx.sidebar.setItems([])
    }).not.toThrow()
  })
})
