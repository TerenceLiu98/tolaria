import { describe, expect, it, vi } from 'vitest'
import {
  FORMATTER_VIEWPORT_PADDING_PX,
  viewportClampMiddleware,
  withViewportSafeMiddleware,
} from './toolbarPositioning'

function runClamp(x: number, width: number) {
  const middleware = viewportClampMiddleware()
  return middleware.fn({
    x,
    rects: {
      floating: { width },
    },
  } as never) as { x: number }
}

describe('toolbarPositioning', () => {
  it('clamps floating toolbar x coordinates inside the viewport padding', () => {
    vi.stubGlobal('visualViewport', { width: 240 })

    expect(runClamp(-100, 80).x).toBe(FORMATTER_VIEWPORT_PADDING_PX)
    expect(runClamp(40, 80).x).toBe(40)
    expect(runClamp(300, 80).x).toBe(152)

    vi.unstubAllGlobals()
  })

  it('preserves existing floating middleware and appends the viewport clamp', () => {
    const existingMiddleware = { name: 'existing', fn: vi.fn() }
    const options = withViewportSafeMiddleware({
      middleware: [existingMiddleware],
      placement: 'top',
    })

    expect(options.placement).toBe('top')
    expect(options.middleware?.at(0)).toBe(existingMiddleware)
    expect(options.middleware?.at(1)).toEqual(expect.objectContaining({
      name: 'tolariaViewportClamp',
    }))
  })
})
