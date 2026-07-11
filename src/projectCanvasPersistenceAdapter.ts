import {
  createProjectCanvas,
  normalizeProjectCanvas,
  readProjectCanvas,
  resolveProjectCanvasRefs,
  saveProjectCanvas,
  validateProjectCanvas,
  type ProjectCanvas,
  type ProjectCanvasReadResult,
  type ProjectCanvasResolveResult,
} from './projectCanvas'

export type ProjectCanvasPersistenceReason = 'viewport' | 'structural' | 'content'

export interface ProjectCanvasPersistenceAdapterOptions {
  vaultPath: string
  projectPath: string
  read?: typeof readProjectCanvas
  create?: typeof createProjectCanvas
  save?: typeof saveProjectCanvas
  resolve?: typeof resolveProjectCanvasRefs
  viewportDebounceMs?: number
  migrateOnLoad?: boolean
  deterministicWrites?: boolean
}

export interface ProjectCanvasLoadResult {
  readonly created: boolean
  readonly result: ProjectCanvasReadResult
  readonly resolve: ProjectCanvasResolveResult | null
}

/** File boundary for project.canvas.json. It never receives Markdown bodies. */
export class ProjectCanvasPersistenceAdapter {
  readonly vaultPath: string
  readonly projectPath: string
  private readonly read: typeof readProjectCanvas
  private readonly create: typeof createProjectCanvas
  private readonly save: typeof saveProjectCanvas
  private readonly resolve: typeof resolveProjectCanvasRefs
  private readonly viewportDebounceMs: number
  private readonly migrateOnLoad: boolean
  private readonly deterministicWrites: boolean
  private viewportTimer: ReturnType<typeof setTimeout> | null = null
  private pendingViewport: ProjectCanvas | null = null
  private viewportWaiters: Array<{ resolve: (result: ProjectCanvasReadResult | null) => void; reject: (error: unknown) => void }> = []

  constructor(options: ProjectCanvasPersistenceAdapterOptions) {
    this.vaultPath = options.vaultPath
    this.projectPath = options.projectPath
    this.read = options.read ?? readProjectCanvas
    this.create = options.create ?? createProjectCanvas
    this.save = options.save ?? saveProjectCanvas
    this.resolve = options.resolve ?? resolveProjectCanvasRefs
    this.viewportDebounceMs = Math.max(0, options.viewportDebounceMs ?? 240)
    this.migrateOnLoad = options.migrateOnLoad !== false
    this.deterministicWrites = options.deterministicWrites !== false
  }

  async load(): Promise<ProjectCanvasLoadResult> {
    let result = await this.read(this.vaultPath, this.projectPath)
    const created = result.state === 'missing' || !result.canvas
    if (created) result = await this.create(this.vaultPath, this.projectPath)
    if (!result.canvas) throw new Error('Project Canvas did not return a canvas')
    const canvas = this.migrateOnLoad
      ? normalizeProjectCanvas(result.canvas, result.projectPath || this.projectPath)
      : { ...result.canvas, viewport: { ...result.canvas.viewport }, nodes: result.canvas.nodes.map(node => ({ ...node })), edges: result.canvas.edges.map(edge => ({ ...edge })) }
    const normalizedResult = { ...result, canvas }
    const errors = validateProjectCanvas(canvas)
    if (errors.length > 0) throw new Error(errors.join('; '))
    const resolved = await this.resolve(this.vaultPath, normalizedResult.projectPath, canvas)
    return { created, result: normalizedResult, resolve: resolved }
  }

  persist(canvas: ProjectCanvas, reason: ProjectCanvasPersistenceReason): Promise<ProjectCanvasReadResult | null> {
    const normalized = this.deterministicWrites
      ? normalizeProjectCanvas(canvas, this.projectPath)
      : { ...canvas, viewport: { ...canvas.viewport }, nodes: canvas.nodes.map(node => ({ ...node })), edges: canvas.edges.map(edge => ({ ...edge })) }
    if (reason === 'viewport') {
      this.pendingViewport = normalized
      if (this.viewportTimer) clearTimeout(this.viewportTimer)
      return new Promise((resolve, reject) => {
        this.viewportWaiters.push({ resolve, reject })
        this.viewportTimer = setTimeout(() => {
          this.viewportTimer = null
          const pending = this.pendingViewport
          this.pendingViewport = null
          const waiters = this.viewportWaiters.splice(0)
          if (!pending) {
            for (const waiter of waiters) waiter.resolve(null)
            return
          }
          this.persistNow(pending)
            .then(result => waiters.forEach(waiter => waiter.resolve(result)))
            .catch(error => waiters.forEach(waiter => waiter.reject(error)))
        }, this.viewportDebounceMs)
      })
    }
    if (this.viewportTimer) clearTimeout(this.viewportTimer)
    this.viewportTimer = null
    this.pendingViewport = null
    const waiters = this.viewportWaiters.splice(0)
    return this.persistNow(normalized).then(result => {
      for (const waiter of waiters) waiter.resolve(result)
      return result
    })
  }

  resolveReferences(canvas: ProjectCanvas): Promise<ProjectCanvasResolveResult> {
    return this.resolve(this.vaultPath, this.projectPath, canvas)
  }

  async flush(): Promise<ProjectCanvasReadResult | null> {
    if (this.viewportTimer) {
      clearTimeout(this.viewportTimer)
      this.viewportTimer = null
    }
    const pending = this.pendingViewport
    this.pendingViewport = null
    const waiters = this.viewportWaiters.splice(0)
    if (!pending) {
      for (const waiter of waiters) waiter.resolve(null)
      return null
    }
    const result = await this.persistNow(pending)
    for (const waiter of waiters) waiter.resolve(result)
    return result
  }

  private persistNow(canvas: ProjectCanvas): Promise<ProjectCanvasReadResult> {
    const nextCanvas = this.deterministicWrites
      ? normalizeProjectCanvas(canvas, this.projectPath)
      : { ...canvas, viewport: { ...canvas.viewport }, nodes: canvas.nodes.map(node => ({ ...node })), edges: canvas.edges.map(edge => ({ ...edge })) }
    return Promise.resolve(this.save(this.vaultPath, this.projectPath, nextCanvas))
  }
}
