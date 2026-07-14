import { describe, expect, it, vi } from 'vitest'
import { defaultProjectCanvas, type ProjectCanvas, type ProjectCanvasReadResult } from './projectCanvas'
import { ProjectCanvasPersistenceAdapter } from './projectCanvasPersistenceAdapter'

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => {
    resolve = next
  })
  return { promise, resolve }
}

function result(canvas: ProjectCanvas): ProjectCanvasReadResult {
  return {
    canvas,
    canvasPath: 'projects/alpha/project.canvas.json',
    projectPath: canvas.project,
    state: 'ready',
  }
}

describe('ProjectCanvasPersistenceAdapter write ordering', () => {
  it('never lets an older viewport write finish after a structural transaction', async () => {
    const initial = defaultProjectCanvas('projects/alpha/project.md')
    const viewport = { ...initial, viewport: { x: 80, y: 40, zoom: 0.8 } }
    const structural = {
      ...viewport,
      nodes: [
        ...viewport.nodes,
        { id: 'task_1', type: 'task' as const, x: 320, y: 180, width: 260, height: 150 },
      ],
    }
    const firstWrite = deferred<ProjectCanvasReadResult>()
    const saved: ProjectCanvas[] = []
    const save = vi.fn((_vault: string, _project: string, canvas: ProjectCanvas) => {
      saved.push(canvas)
      return saved.length === 1 ? firstWrite.promise : Promise.resolve(result(canvas))
    })
    const adapter = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      save,
      viewportDebounceMs: 0,
    })

    const viewportWrite = adapter.persist(viewport, 'viewport')
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const structuralWrite = adapter.persist(structural, 'structural')

    expect(save).toHaveBeenCalledTimes(1)
    firstWrite.resolve(result(viewport))
    await viewportWrite
    await structuralWrite

    expect(save).toHaveBeenCalledTimes(2)
    expect(saved.map(canvas => canvas.nodes.some(node => node.id === 'task_1'))).toEqual([false, true])
  })

  it('waits for an active write when the persistence boundary is flushed', async () => {
    const canvas = defaultProjectCanvas('projects/alpha/project.md')
    const activeWrite = deferred<ProjectCanvasReadResult>()
    const adapter = new ProjectCanvasPersistenceAdapter({
      projectPath: canvas.project,
      vaultPath: '/vault',
      save: () => activeWrite.promise,
    })

    const write = adapter.persist(canvas, 'structural')
    const flush = adapter.flush()
    let flushed = false
    void flush.then(() => {
      flushed = true
    })
    await Promise.resolve()
    expect(flushed).toBe(false)

    activeWrite.resolve(result(canvas))
    await expect(write).resolves.toEqual(result(canvas))
    await expect(flush).resolves.toEqual(result(canvas))
  })
})
