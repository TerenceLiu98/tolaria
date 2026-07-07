export interface SideMenuCommentRect {
  left: number
  right: number
  top: number
  width: number
}

export interface SideMenuCommentPosition {
  left: number
  top: number
}

const COMMENT_THREAD_MAX_WIDTH = 352
const COMMENT_THREAD_HORIZONTAL_MARGIN = 8
const COMMENT_THREAD_PORTAL_INSET = 80

export function sideMenuCommentThreadPosition({
  markerRect,
  portalRect,
}: {
  markerRect: SideMenuCommentRect
  portalRect: SideMenuCommentRect
}): SideMenuCommentPosition {
  const panelWidth = Math.min(
    COMMENT_THREAD_MAX_WIDTH,
    Math.max(0, portalRect.width - COMMENT_THREAD_PORTAL_INSET),
  )
  const maxLeft = Math.max(0, portalRect.width - panelWidth - COMMENT_THREAD_HORIZONTAL_MARGIN)
  const preferredLeft = markerRect.right - portalRect.left + COMMENT_THREAD_HORIZONTAL_MARGIN

  return {
    left: Math.min(Math.max(0, preferredLeft), maxLeft),
    top: Math.max(0, markerRect.top - portalRect.top),
  }
}
