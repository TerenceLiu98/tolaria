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

export interface CanvasOverlaySnapshot {
  readonly active: readonly CanvasOverlayKind[]
  readonly rect: CanvasOverlayRect | null
  readonly handleSize: number
  readonly revision: number
}

/** Screen-space placement and focus/dismissal boundary for Canvas chrome. */
export class CanvasOverlayCoordinator {
  private activeValue: CanvasOverlayKind[] = []
  private rectValue: CanvasOverlayRect | null = null
  private revision = 0
  private readonly listeners = new Set<() => void>()

  getSnapshot = (): CanvasOverlaySnapshot => ({
    active: this.activeValue,
    rect: this.rectValue,
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

  positionForNodes(nodes: readonly ProjectCanvasNode[], viewport: CanvasViewport, notify = true): CanvasOverlayRect | null {
    if (nodes.length === 0) {
      this.rectValue = null
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
    if (notify) this.publish()
    return this.rectValue
  }

  screenPointForCanvas(point: CanvasPoint, viewport: CanvasViewport): CanvasPoint {
    return viewport.canvasToScreen(point)
  }

  dismiss(): void {
    this.activeValue = []
    this.rectValue = null
    this.publish()
  }

  private publish(): void {
    this.revision += 1
    for (const listener of this.listeners) listener()
  }
}
