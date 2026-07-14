import { describe, expect, it, vi } from 'vitest'
import { defaultProjectCanvas, type ProjectCanvas, type ProjectCanvasReadResult } from './projectCanvas'
import { ProjectCanvasController } from './projectCanvasController'
import { ProjectCanvasPersistenceAdapter } from './projectCanvasPersistenceAdapter'

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly reject: (reason: unknown) => void
  readonly resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, reject, resolve }
}

function result(canvas: ProjectCanvas): ProjectCanvasReadResult {
  return {
    canvas,
    canvasPath: 'projects/alpha/project.canvas.json',
    projectPath: canvas.project,
    state: 'ready',
  }
}

describe('ProjectCanvasController persistence status', () => {
  it('stays saving until every queued Canvas write is durable', async () => {
    const canvas = defaultProjectCanvas('projects/alpha/project.md')
    const writes = [deferred<ProjectCanvasReadResult>(), deferred<ProjectCanvasReadResult>()]
    const save = vi.fn(() => writes[save.mock.calls.length - 1].promise)
    const persistence = new ProjectCanvasPersistenceAdapter({
      projectPath: canvas.project,
      vaultPath: '/vault',
      read: async () => result(canvas),
      resolve: async () => ({
        canvasPath: 'projects/alpha/project.canvas.json',
        diagnostics: [],
        projectPath: canvas.project,
        refs: [],
      }),
      save,
    })
    const controller = new ProjectCanvasController({ persistence })
    await controller.load()

    const first = controller.persist(canvas, 'structural')
    const second = controller.persist(canvas, 'structural')
    await vi.waitFor(() => expect(controller.getSnapshot().saving).toBe(true))

    writes[0].resolve(result(canvas))
    await first
    expect(controller.getSnapshot().saving).toBe(true)
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))

    writes[1].resolve(result(canvas))
    await second
    expect(controller.getSnapshot().saving).toBe(false)
    controller.dispose()
  })

  it('keeps the loaded Canvas usable and exposes a failed write until a retry succeeds', async () => {
    const canvas = defaultProjectCanvas('projects/alpha/project.md')
    const failedWrite = deferred<ProjectCanvasReadResult>()
    const save = vi.fn()
      .mockImplementationOnce(() => failedWrite.promise)
      .mockImplementationOnce(async () => result(canvas))
    const persistence = new ProjectCanvasPersistenceAdapter({
      projectPath: canvas.project,
      vaultPath: '/vault',
      read: async () => result(canvas),
      resolve: async () => ({
        canvasPath: 'projects/alpha/project.canvas.json',
        diagnostics: [],
        projectPath: canvas.project,
        refs: [],
      }),
      save,
    })
    const controller = new ProjectCanvasController({ persistence })
    await controller.load()

    const failed = controller.persist(canvas, 'structural')
    failedWrite.reject(new Error('disk full'))
    await failed
    expect(controller.getSnapshot()).toMatchObject({
      error: 'disk full',
      saving: false,
      status: 'ready',
    })
    expect(controller.getSnapshot().scene).not.toBeNull()

    await controller.persist(canvas, 'structural')
    expect(controller.getSnapshot()).toMatchObject({ error: null, saving: false, status: 'ready' })
    controller.dispose()
  })
})
