import type { ProjectCanvasViewport } from './projectCanvas'
import type { CanvasBounds, CanvasPoint } from './canvasSceneStore'

export const CANVAS_ZOOM_MIN = 0.35
export const CANVAS_ZOOM_MAX = 2
export const DEFAULT_OVERSCAN_PX = 240

export interface CanvasViewportSize {
  width: number
  height: number
}

export interface CanvasViewportBounds {
  width: number
  height: number
}

export interface CanvasViewportSnapshot {
  readonly camera: ProjectCanvasViewport
  readonly size: CanvasViewportSize
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
  return {
    minX: (-padding - camera.x) / zoom,
    minY: (-padding - camera.y) / zoom,
    maxX: (size.width + padding - camera.x) / zoom,
    maxY: (size.height + padding - camera.y) / zoom,
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
    if (!bounds || this.sizeValue.width <= 0 || this.sizeValue.height <= 0) {
      this.scheduleCamera({ x: 0, y: 0, zoom: 1 })
      return
    }
    const width = Math.max(1, bounds.maxX - bounds.minX)
    const height = Math.max(1, bounds.maxY - bounds.minY)
    const zoom = Math.min(
      maxZoom,
      CANVAS_ZOOM_MAX,
      Math.max(CANVAS_ZOOM_MIN, Math.min(
        (this.sizeValue.width - padding * 2) / width,
        (this.sizeValue.height - padding * 2) / height,
      )),
    )
    this.scheduleCamera({
      zoom,
      x: this.sizeValue.width / 2 - (bounds.minX + width / 2) * zoom,
      y: this.sizeValue.height / 2 - (bounds.minY + height / 2) * zoom,
    })
  }

  fitToSelection(bounds: CanvasBounds | null, padding = 96): void {
    this.fitToBounds(bounds, padding)
  }

  focusOnBounds(bounds: CanvasBounds): void {
    const width = Math.max(1, bounds.maxX - bounds.minX)
    const height = Math.max(1, bounds.maxY - bounds.minY)
    const camera = this.pendingCamera ?? this.cameraValue
    this.scheduleCamera({
      x: this.sizeValue.width / 2 - (bounds.minX + width / 2) * camera.zoom,
      y: this.sizeValue.height / 2 - (bounds.minY + height / 2) * camera.zoom,
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

  private publish(): void {
    this.revision += 1
    for (const listener of this.listeners) listener()
  }
}
