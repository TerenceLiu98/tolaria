import type { ProjectCanvas } from './projectCanvas'

export type CanvasHistoryDomain = 'canvas' | 'document'

export interface CanvasHistoryTransaction {
  readonly label: string
  readonly before: ProjectCanvas
  readonly after: ProjectCanvas
}

function cloneCanvas(canvas: ProjectCanvas): ProjectCanvas {
  return {
    ...canvas,
    viewport: { ...canvas.viewport },
    nodes: canvas.nodes.map(node => ({ ...node })),
    edges: canvas.edges.map(edge => ({ ...edge })),
    sapientia: { ...canvas.sapientia },
  }
}

function equalCanvas(left: ProjectCanvas, right: ProjectCanvas): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Bounded Canvas transactions. BlockNote history never enters this manager. */
export class CanvasHistoryManager {
  private readonly undoStack: CanvasHistoryTransaction[] = []
  private readonly redoStack: CanvasHistoryTransaction[] = []
  private readonly maxEntries: number
  private activeDomainValue: CanvasHistoryDomain = 'canvas'
  private listeners = new Set<() => void>()

  constructor(maxEntries = 100) {
    this.maxEntries = Math.max(1, maxEntries)
  }

  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }
  get activeDomain(): CanvasHistoryDomain { return this.activeDomainValue }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setActiveDomain(domain: CanvasHistoryDomain): void {
    this.activeDomainValue = domain
    this.publish()
  }

  begin(label: string, before: ProjectCanvas): { label: string; before: ProjectCanvas } {
    return { label, before: cloneCanvas(before) }
  }

  commit(transaction: { label: string; before: ProjectCanvas }, after: ProjectCanvas, domain: CanvasHistoryDomain = 'canvas'): boolean {
    if (domain !== 'canvas' || equalCanvas(transaction.before, after)) return false
    this.undoStack.push({ label: transaction.label, before: transaction.before, after: cloneCanvas(after) })
    while (this.undoStack.length > this.maxEntries) this.undoStack.shift()
    this.redoStack.length = 0
    this.publish()
    return true
  }

  record(label: string, before: ProjectCanvas, after: ProjectCanvas, domain: CanvasHistoryDomain = 'canvas'): boolean {
    return this.commit(this.begin(label, before), after, domain)
  }

  undo(current: ProjectCanvas): ProjectCanvas | null {
    if (this.activeDomainValue !== 'canvas') return null
    const transaction = this.undoStack.pop()
    if (!transaction) return null
    this.redoStack.push({ ...transaction, before: cloneCanvas(transaction.before), after: cloneCanvas(current) })
    this.publish()
    return cloneCanvas(transaction.before)
  }

  redo(current: ProjectCanvas): ProjectCanvas | null {
    if (this.activeDomainValue !== 'canvas') return null
    const transaction = this.redoStack.pop()
    if (!transaction) return null
    this.undoStack.push({ ...transaction, before: cloneCanvas(current), after: cloneCanvas(transaction.after) })
    this.publish()
    return cloneCanvas(transaction.after)
  }

  clear(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
    this.publish()
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }
}
