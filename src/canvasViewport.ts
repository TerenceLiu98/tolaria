import type { ProjectCanvasViewport } from './projectCanvas'
import type { CanvasBounds, CanvasPoint } from './canvasSceneStore'

export const CANVAS_ZOOM_MIN = 0.35
export const CANVAS_ZOOM_MAX = 2
export const DEFAULT_OVERSCAN_PX = 240

export interface CanvasViewportSize {
  width: number
  height: number
  left?: number
  top?: number
}

export interface CanvasViewportBounds {
  width: number
  height: number
}

export interface CanvasViewportSnapshot {
  readonly camera: ProjectCanvasViewport
  readonly size: CanvasViewportSize
  readonly origin: CanvasPoint
  readonly overscan: number
  readonly renderBounds: CanvasBounds
  readonly hitTestBounds: CanvasBounds
  readonly revision: number
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clampZoom(value: number): number {
  return Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, finite(value, 1)))
}

function safeCamera(camera: Partial<ProjectCanvasViewport>): ProjectCanvasViewport {
  return {
    x: finite(camera.x ?? 0, 0),
    y: finite(camera.y ?? 0, 0),
    zoom: clampZoom(camera.zoom ?? 1),
  }
}

function boundsForCamera(camera: ProjectCanvasViewport, size: CanvasViewportSize, padding: number): CanvasBounds {
  const zoom = camera.zoom
  const effectivePadding = zoom < 0.5 ? Math.min(padding, 24) : padding
  return {
    minX: (-effectivePadding - camera.x) / zoom,
    minY: (-effectivePadding - camera.y) / zoom,
    maxX: (size.width + effectivePadding - camera.x) / zoom,
    maxY: (size.height + effectivePadding - camera.y) / zoom,
  }
}

function requestFrame(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback)
  return globalThis.setTimeout(() => callback(Date.now()), 0)
}

function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle)
  else globalThis.clearTimeout(handle)
}

/** Camera and coordinate conversion boundary. React never owns raw camera math. */
export class CanvasViewport {
  private cameraValue: ProjectCanvasViewport
  private sizeValue: CanvasViewportSize = { width: 0, height: 0 }
  private originValue: CanvasPoint = { x: 0, y: 0 }
  private overscanValue: number
  private revision = 0
  private pendingCamera: ProjectCanvasViewport | null = null
  private frame: number | null = null
  private restoreCamera: ProjectCanvasViewport | null = null
  private readonly listeners = new Set<() => void>()

  constructor(camera: Partial<ProjectCanvasViewport> = {}, overscan = DEFAULT_OVERSCAN_PX) {
    this.cameraValue = safeCamera(camera)
    this.overscanValue = Math.min(1024, Math.max(0, finite(overscan, DEFAULT_OVERSCAN_PX)))
  }

  getSnapshot = (): CanvasViewportSnapshot => ({
    camera: { ...this.cameraValue },
    size: { ...this.sizeValue },
    origin: { ...this.originValue },
    overscan: this.overscanValue,
    renderBounds: boundsForCamera(this.cameraValue, this.sizeValue, this.overscanValue),
    hitTestBounds: boundsForCamera(this.cameraValue, this.sizeValue, 0),
    revision: this.revision,
  })

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getCamera(): ProjectCanvasViewport {
    return { ...this.cameraValue }
  }

  setViewportSize(size: CanvasViewportSize): void {
    this.sizeValue = {
      width: Math.max(0, finite(size.width, 0)),
      height: Math.max(0, finite(size.height, 0)),
    }
    this.originValue = {
      x: finite(size.left ?? 0, 0),
      y: finite(size.top ?? 0, 0),
    }
    this.publish()
  }

  setOverscan(overscan: number): void {
    this.overscanValue = Math.min(1024, Math.max(0, finite(overscan, DEFAULT_OVERSCAN_PX)))
    this.publish()
  }

  scheduleCamera(camera: Partial<ProjectCanvasViewport>): void {
    this.pendingCamera = safeCamera({ ...this.cameraValue, ...camera })
    if (this.frame !== null) return
    this.frame = requestFrame(() => {
      this.frame = null
      if (!this.pendingCamera) return
      this.cameraValue = this.pendingCamera
      this.pendingCamera = null
      this.publish()
    })
  }

  flush(): void {
    if (this.frame !== null) {
      cancelFrame(this.frame)
      this.frame = null
    }
    if (!this.pendingCamera) return
    this.cameraValue = this.pendingCamera
    this.pendingCamera = null
    this.publish()
  }

  screenToCanvas(point: CanvasPoint): CanvasPoint {
    const camera = this.pendingCamera ?? this.cameraValue
    return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom }
  }

  clientToScreen(point: CanvasPoint): CanvasPoint {
    return { x: finite(point.x, this.originValue.x) - this.originValue.x, y: finite(point.y, this.originValue.y) - this.originValue.y }
  }

  clientToCanvas(point: CanvasPoint): CanvasPoint {
    return this.screenToCanvas(this.clientToScreen(point))
  }

  canvasCenter(width: number, height: number, fallback: CanvasViewportSize = { width: 760, height: 460 }): CanvasPoint {
    const viewportWidth = this.sizeValue.width > 0 ? this.sizeValue.width : fallback.width
    const viewportHeight = this.sizeValue.height > 0 ? this.sizeValue.height : fallback.height
    const center = this.screenToCanvas({ x: viewportWidth / 2, y: viewportHeight / 2 })
    return { x: center.x - width / 2, y: center.y - height / 2 }
  }

  graphicsBounds(
    bounds: CanvasBounds | null,
    padding = 240,
    minimumWidth = 1200,
    minimumHeight = 900,
  ): { minX: number; minY: number; width: number; height: number } {
    if (!bounds) return { minX: -400, minY: -300, width: minimumWidth, height: minimumHeight }
    return {
      minX: bounds.minX - padding,
      minY: bounds.minY - padding,
      width: Math.max(minimumWidth, bounds.maxX - bounds.minX + padding * 2),
      height: Math.max(minimumHeight, bounds.maxY - bounds.minY + padding * 2),
    }
  }

  canvasToScreen(point: CanvasPoint): CanvasPoint {
    const camera = this.pendingCamera ?? this.cameraValue
    return { x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y }
  }

  zoomAtScreenPoint(point: CanvasPoint, zoom: number): void {
    const current = this.pendingCamera ?? this.cameraValue
    const nextZoom = clampZoom(zoom)
    const canvasPoint = { x: (point.x - current.x) / current.zoom, y: (point.y - current.y) / current.zoom }
    this.scheduleCamera({
      zoom: nextZoom,
      x: point.x - canvasPoint.x * nextZoom,
      y: point.y - canvasPoint.y * nextZoom,
    })
  }

  fitToBounds(bounds: CanvasBounds | null, padding = 96, maxZoom = 1.35): void {
    if (!bounds) {
      this.scheduleCamera({ x: 0, y: 0, zoom: 1 })
      return
    }
    const viewportWidth = this.sizeValue.width > 0 ? this.sizeValue.width : 760
    const viewportHeight = this.sizeValue.height > 0 ? this.sizeValue.height : 460
    const width = Math.max(1, bounds.maxX - bounds.minX)
    const height = Math.max(1, bounds.maxY - bounds.minY)
    const zoom = Math.min(
      maxZoom,
      CANVAS_ZOOM_MAX,
      Math.max(CANVAS_ZOOM_MIN, Math.min(
        (viewportWidth - padding * 2) / width,
        (viewportHeight - padding * 2) / height,
      )),
    )
    this.scheduleCamera({
      zoom,
      x: viewportWidth / 2 - (bounds.minX + width / 2) * zoom,
      y: viewportHeight / 2 - (bounds.minY + height / 2) * zoom,
    })
  }

  fitToSelection(bounds: CanvasBounds | null, padding = 96): void {
    this.fitToBounds(bounds, padding)
  }

  focusOnBounds(bounds: CanvasBounds): void {
    const width = Math.max(1, bounds.maxX - bounds.minX)
    const height = Math.max(1, bounds.maxY - bounds.minY)
    const camera = this.pendingCamera ?? this.cameraValue
    const viewportWidth = this.sizeValue.width > 0 ? this.sizeValue.width : 760
    const viewportHeight = this.sizeValue.height > 0 ? this.sizeValue.height : 460
    this.scheduleCamera({
      x: viewportWidth / 2 - (bounds.minX + width / 2) * camera.zoom,
      y: viewportHeight / 2 - (bounds.minY + height / 2) * camera.zoom,
    })
  }

  saveCameraForFocus(): void {
    this.restoreCamera = this.getCamera()
  }

  restoreCameraAfterFocus(): void {
    if (!this.restoreCamera) return
    this.scheduleCamera(this.restoreCamera)
    this.restoreCamera = null
  }

  dispose(): void {
    if (this.frame !== null) cancelFrame(this.frame)
    this.frame = null
    this.pendingCamera = null
    this.listeners.clear()
  }

  private publish(): void {
    this.revision += 1
    for (const listener of this.listeners) listener()
  }
}
