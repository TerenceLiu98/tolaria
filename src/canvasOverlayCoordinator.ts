import type { CanvasPoint } from './canvasSceneStore'
import type { CanvasViewport } from './canvasViewport'
import type { ProjectCanvasNode } from './projectCanvas'

export type CanvasOverlayKind = 'selection' | 'resize' | 'connection' | 'toolbar' | 'menu' | 'comment' | 'snap'
export type CanvasOverlayFocusOwner = 'canvas' | 'overlay' | 'editor'

export interface CanvasOverlayRect {
  left: number
  top: number
  width: number
  height: number
}

export interface CanvasOverlayHandle {
  readonly kind: 'resize' | 'connect'
  readonly nodeId: string
  readonly left: number
  readonly top: number
}

export interface CanvasOverlayGuide {
  readonly orientation: 'horizontal' | 'vertical'
  readonly position: number
}

export interface CanvasOverlaySnapshot {
  readonly active: readonly CanvasOverlayKind[]
  readonly rect: CanvasOverlayRect | null
  readonly handles: readonly CanvasOverlayHandle[]
  readonly handleSize: number
  readonly toolbarRect: CanvasOverlayRect | null
  readonly snapGuides: readonly CanvasOverlayGuide[]
  readonly clip: CanvasOverlayRect | null
  readonly zOrder: readonly CanvasOverlayKind[]
  readonly zIndices: Readonly<Record<CanvasOverlayKind, number>>
  readonly focusOwner: CanvasOverlayFocusOwner
  readonly revision: number
}

const OVERLAY_Z_ORDER: readonly CanvasOverlayKind[] = ['selection', 'snap', 'resize', 'connection', 'toolbar', 'comment', 'menu']
const OVERLAY_Z_INDICES: Readonly<Record<CanvasOverlayKind, number>> = {
  selection: 100,
  snap: 101,
  resize: 102,
  connection: 103,
  toolbar: 104,
  comment: 105,
  menu: 106,
}

/** Screen-space placement and focus/dismissal boundary for Canvas chrome. */
export class CanvasOverlayCoordinator {
  private activeValue: CanvasOverlayKind[] = []
  private rectValue: CanvasOverlayRect | null = null
  private handlesValue: CanvasOverlayHandle[] = []
  private toolbarRectValue: CanvasOverlayRect | null = null
  private snapGuidesValue: CanvasOverlayGuide[] = []
  private clipValue: CanvasOverlayRect | null = null
  private focusOwnerValue: CanvasOverlayFocusOwner = 'canvas'
  private revision = 0
  private readonly listeners = new Set<() => void>()

  getSnapshot = (): CanvasOverlaySnapshot => ({
    active: this.activeValue,
    rect: this.rectValue,
    handles: this.handlesValue,
    handleSize: 8,
    toolbarRect: this.toolbarRectValue,
    snapGuides: this.snapGuidesValue,
    clip: this.clipValue,
    zOrder: OVERLAY_Z_ORDER,
    zIndices: OVERLAY_Z_INDICES,
    focusOwner: this.focusOwnerValue,
    revision: this.revision,
  })

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setActive(active: readonly CanvasOverlayKind[], notify = true): void {
    this.activeValue = [...new Set(active)]
    if (notify) this.publish()
  }

  zIndexFor(kind: CanvasOverlayKind): number {
    return OVERLAY_Z_INDICES[kind]
  }

  setViewportBounds(bounds: CanvasOverlayRect | null, notify = true): void {
    this.clipValue = bounds ? { ...bounds } : null
    if (notify) this.publish()
  }

  setFocusOwner(owner: CanvasOverlayFocusOwner, notify = true): void {
    this.focusOwnerValue = owner
    if (notify) this.publish()
  }

  setSnapGuides(guides: readonly CanvasOverlayGuide[], notify = true): void {
    this.snapGuidesValue = guides.map(guide => ({ ...guide }))
    if (notify) this.publish()
  }

  positionForNodes(
    nodes: readonly ProjectCanvasNode[],
    viewport: CanvasViewport,
    notify = true,
    primaryNodeId: string | null = null,
    canResize: (node: ProjectCanvasNode) => boolean = () => true,
  ): CanvasOverlayRect | null {
    if (nodes.length === 0) {
      this.rectValue = null
      this.handlesValue = []
      this.toolbarRectValue = null
      if (notify) this.publish()
      return null
    }
    const minX = Math.min(...nodes.map(node => node.x))
    const minY = Math.min(...nodes.map(node => node.y))
    const maxX = Math.max(...nodes.map(node => node.x + node.width))
    const maxY = Math.max(...nodes.map(node => node.y + node.height))
    const topLeft = viewport.canvasToScreen({ x: minX, y: minY })
    const bottomRight = viewport.canvasToScreen({ x: maxX, y: maxY })
    this.rectValue = {
      left: topLeft.x,
      top: topLeft.y,
      width: Math.max(0, bottomRight.x - topLeft.x),
      height: Math.max(0, bottomRight.y - topLeft.y),
    }
    this.rectValue = this.clipRect(this.rectValue)
    this.toolbarRectValue = this.rectValue
      ? this.clipRect({
        left: this.rectValue.left,
        top: this.rectValue.top - 32,
        width: Math.max(120, Math.min(240, this.rectValue.width)),
        height: 28,
      })
      : null
    this.handlesValue = nodes.flatMap(node => {
      const nodeTopLeft = viewport.canvasToScreen({ x: node.x, y: node.y })
      const nodeBottomRight = viewport.canvasToScreen({ x: node.x + node.width, y: node.y + node.height })
      const handles: CanvasOverlayHandle[] = [{
        kind: 'connect',
        nodeId: node.id,
        left: nodeBottomRight.x,
        top: nodeTopLeft.y + (nodeBottomRight.y - nodeTopLeft.y) / 2,
      }]
      if (canResize(node) && (node.id === primaryNodeId || (!primaryNodeId && nodes.length === 1))) handles.push({
        kind: 'resize',
        nodeId: node.id,
        left: nodeBottomRight.x,
        top: nodeBottomRight.y,
      })
      return handles.filter(handle => this.isInsideClip(handle.left, handle.top))
    })
    if (notify) this.publish()
    return this.rectValue
  }

  screenPointForCanvas(point: CanvasPoint, viewport: CanvasViewport): CanvasPoint {
    return viewport.canvasToScreen(point)
  }

  connectionHandlesForNodes(nodes: readonly ProjectCanvasNode[], viewport: CanvasViewport): CanvasOverlayHandle[] {
    return nodes.map(node => {
      const topLeft = viewport.canvasToScreen({ x: node.x, y: node.y })
      const bottomRight = viewport.canvasToScreen({ x: node.x + node.width, y: node.y + node.height })
      return {
        kind: 'connect' as const,
        nodeId: node.id,
        left: bottomRight.x,
        top: topLeft.y + (bottomRight.y - topLeft.y) / 2,
      }
    }).filter(handle => this.isInsideClip(handle.left, handle.top))
  }

  positionToolbar(anchor: CanvasPoint, width = 180, height = 28, viewport: CanvasViewport, notify = true): CanvasOverlayRect | null {
    const point = viewport.canvasToScreen(anchor)
    this.toolbarRectValue = this.clipRect({ left: point.x, top: point.y, width, height })
    if (notify) this.publish()
    return this.toolbarRectValue
  }

  dismissTop(): CanvasOverlayKind | null {
    const active = new Set(this.activeValue)
    const kind = [...OVERLAY_Z_ORDER].reverse().find(candidate => active.has(candidate))
    if (!kind) return null
    this.activeValue = this.activeValue.filter(candidate => candidate !== kind)
    this.publish()
    return kind
  }

  dismiss(): void {
    this.activeValue = []
    this.rectValue = null
    this.handlesValue = []
    this.toolbarRectValue = null
    this.snapGuidesValue = []
    this.focusOwnerValue = 'canvas'
    this.publish()
  }

  private clipRect(rect: CanvasOverlayRect): CanvasOverlayRect | null {
    if (!this.clipValue) return rect
    const right = Math.min(rect.left + rect.width, this.clipValue.left + this.clipValue.width)
    const bottom = Math.min(rect.top + rect.height, this.clipValue.top + this.clipValue.height)
    const left = Math.max(rect.left, this.clipValue.left)
    const top = Math.max(rect.top, this.clipValue.top)
    if (right <= left || bottom <= top) return null
    return { left, top, width: right - left, height: bottom - top }
  }

  private isInsideClip(left: number, top: number): boolean {
    if (!this.clipValue) return true
    return left >= this.clipValue.left
      && left <= this.clipValue.left + this.clipValue.width
      && top >= this.clipValue.top
      && top <= this.clipValue.top + this.clipValue.height
  }

  private publish(): void {
    this.revision += 1
    for (const listener of this.listeners) listener()
  }
}
