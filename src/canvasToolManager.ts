import type { CanvasPoint } from './canvasSceneStore'

export type CanvasTool = 'select' | 'hand' | 'connect' | 'frame'
export type CanvasGestureKind = 'pan' | 'drag' | 'resize' | 'connect' | 'reconnect' | 'marquee' | 'group'
export type CanvasGestureEndpoint = 'from' | 'to'
export type CanvasGesturePhase = 'idle' | 'pressed' | 'active' | 'committed' | 'cancelled'

export interface CanvasGestureSnapshot {
  readonly kind: CanvasGestureKind | null
  readonly phase: CanvasGesturePhase
  readonly start: CanvasPoint | null
  readonly current: CanvasPoint | null
  readonly pointerId: number | null
  readonly targetId: string | null
  readonly endpoint: CanvasGestureEndpoint | null
  readonly revision: number
}

export interface CanvasPointerInput {
  point: CanvasPoint
  pointerId?: number
  targetId?: string | null
  endpoint?: CanvasGestureEndpoint | null
  shiftKey?: boolean
  spaceOverride?: boolean
}

export class CanvasToolManager {
  private toolValue: CanvasTool = 'select'
  private spacePressedValue = false
  private gestureValue: CanvasGestureSnapshot = {
    kind: null,
    phase: 'idle',
    start: null,
    current: null,
    pointerId: null,
    targetId: null,
    endpoint: null,
    revision: 0,
  }
  private readonly listeners = new Set<() => void>()

  getTool(): CanvasTool {
    return this.toolValue
  }

  getSnapshot = (): CanvasGestureSnapshot => this.gestureValue

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setTool(tool: CanvasTool): void {
    this.toolValue = tool
    this.publish()
  }

  setSpacePressed(pressed: boolean): void {
    this.spacePressedValue = pressed
    this.publish()
  }

  isHandOverrideActive(): boolean {
    return this.spacePressedValue
  }

  effectiveTool(): CanvasTool {
    return this.spacePressedValue ? 'hand' : this.toolValue
  }

  begin(kind: CanvasGestureKind, input: CanvasPointerInput): CanvasGestureSnapshot {
    const activeKind = input.spaceOverride || this.spacePressedValue ? 'pan' : kind
    this.gestureValue = {
      kind: activeKind,
      phase: 'pressed',
      start: { ...input.point },
      current: { ...input.point },
      pointerId: input.pointerId ?? null,
      targetId: input.targetId ?? null,
      endpoint: input.endpoint ?? null,
      revision: this.gestureValue.revision + 1,
    }
    this.publish()
    return this.gestureValue
  }

  update(point: CanvasPoint, notify = true): CanvasGestureSnapshot {
    if (this.gestureValue.phase === 'idle') return this.gestureValue
    const start = this.gestureValue.start ?? point
    const moved = Math.abs(point.x - start.x) + Math.abs(point.y - start.y) > 4
    this.gestureValue = {
      ...this.gestureValue,
      current: { ...point },
      phase: moved ? 'active' : this.gestureValue.phase,
      revision: this.gestureValue.revision + 1,
    }
    if (notify) this.publish()
    return this.gestureValue
  }

  commit(): CanvasGestureSnapshot {
    this.gestureValue = { ...this.gestureValue, phase: 'committed', revision: this.gestureValue.revision + 1 }
    const committed = this.gestureValue
    this.publish()
    this.reset()
    return committed
  }

  cancel(): CanvasGestureSnapshot {
    this.gestureValue = { ...this.gestureValue, phase: 'cancelled', revision: this.gestureValue.revision + 1 }
    const cancelled = this.gestureValue
    this.publish()
    this.reset()
    return cancelled
  }

  reset(): void {
    this.gestureValue = {
      kind: null,
      phase: 'idle',
      start: null,
      current: null,
      pointerId: null,
      targetId: null,
      endpoint: null,
      revision: this.gestureValue.revision + 1,
    }
    this.publish()
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }
}
