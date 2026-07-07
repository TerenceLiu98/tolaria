import { describe, expect, it } from 'vitest'
import { sideMenuCommentThreadPosition } from './sideMenuCommentPosition'

describe('sideMenuCommentPosition', () => {
  it('places the thread next to the comment marker inside the portal coordinate space', () => {
    expect(sideMenuCommentThreadPosition({
      markerRect: { left: 120, right: 144, top: 240, width: 24 },
      portalRect: { left: 100, right: 700, top: 200, width: 600 },
    })).toEqual({
      left: 52,
      top: 40,
    })
  })

  it('clamps the thread when the marker is near the right portal edge', () => {
    expect(sideMenuCommentThreadPosition({
      markerRect: { left: 660, right: 684, top: 220, width: 24 },
      portalRect: { left: 100, right: 700, top: 200, width: 600 },
    })).toEqual({
      left: 240,
      top: 20,
    })
  })

  it('keeps the position non-negative for narrow portals or offscreen markers', () => {
    expect(sideMenuCommentThreadPosition({
      markerRect: { left: 0, right: 10, top: 120, width: 10 },
      portalRect: { left: 40, right: 90, top: 200, width: 50 },
    })).toEqual({
      left: 0,
      top: 0,
    })
  })
})
