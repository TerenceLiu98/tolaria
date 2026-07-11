import type { CanvasPoint } from './canvasSceneStore'
import type { CanvasViewport } from './canvasViewport'
import type { ProjectCanvasNode } from './projectCanvas'

export type CanvasOverlayKind = 'selection' | 'resize' | 'connection' | 'toolbar' | 'menu' | 'comment' | 'snap'

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

export interface CanvasOverlaySnapshot {
  readonly active: readonly CanvasOverlayKind[]
  readonly rect: CanvasOverlayRect | null
  readonly handles: readonly CanvasOverlayHandle[]
  readonly handleSize: number
  readonly revision: number
}

/** Screen-space placement and focus/dismissal boundary for Canvas chrome. */
export class CanvasOverlayCoordinator {
  private activeValue: CanvasOverlayKind[] = []
  private rectValue: CanvasOverlayRect | null = null
  private handlesValue: CanvasOverlayHandle[] = []
  private revision = 0
  private readonly listeners = new Set<() => void>()

  getSnapshot = (): CanvasOverlaySnapshot => ({
    active: this.activeValue,
    rect: this.rectValue,
    handles: this.handlesValue,
    handleSize: 8,
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

  positionForNodes(nodes: readonly ProjectCanvasNode[], viewport: CanvasViewport, notify = true, primaryNodeId: string | null = null): CanvasOverlayRect | null {
    if (nodes.length === 0) {
      this.rectValue = null
      this.handlesValue = []
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
    this.handlesValue = nodes.flatMap(node => {
      const nodeTopLeft = viewport.canvasToScreen({ x: node.x, y: node.y })
      const nodeBottomRight = viewport.canvasToScreen({ x: node.x + node.width, y: node.y + node.height })
      const handles: CanvasOverlayHandle[] = [{
        kind: 'connect',
        nodeId: node.id,
        left: nodeBottomRight.x,
        top: nodeTopLeft.y + (nodeBottomRight.y - nodeTopLeft.y) / 2,
      }]
      if (node.id === primaryNodeId || (!primaryNodeId && nodes.length === 1)) handles.push({
        kind: 'resize',
        nodeId: node.id,
        left: nodeBottomRight.x,
        top: nodeBottomRight.y,
      })
      return handles
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
    })
  }

  dismiss(): void {
    this.activeValue = []
    this.rectValue = null
    this.handlesValue = []
    this.publish()
  }

  private publish(): void {
    this.revision += 1
    for (const listener of this.listeners) listener()
  }
}
