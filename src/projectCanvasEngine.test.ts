import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasHistoryManager } from './canvasHistoryManager'
import { CanvasLayerManager } from './canvasLayerManager'
import { CanvasNodeSpecRegistry } from './canvasNodeSpecRegistry'
import { CanvasOverlayCoordinator } from './canvasOverlayCoordinator'
import { CanvasSceneStore } from './canvasSceneStore'
import { CanvasSelectionManager } from './canvasSelectionManager'
import { CanvasToolManager } from './canvasToolManager'
import { CanvasViewport } from './canvasViewport'
import { defaultProjectCanvas, type ProjectCanvas, type ProjectCanvasReadResult, type ProjectCanvasResolveResult } from './projectCanvas'
import { ProjectCanvasController } from './projectCanvasController'
import { ProjectCanvasPersistenceAdapter } from './projectCanvasPersistenceAdapter'

function canvasWithNodes(): ProjectCanvas {
  return {
    ...defaultProjectCanvas('projects/alpha/project.md'),
    nodes: [
      { id: 'z', type: 'text', x: 900, y: 900, width: 100, height: 100, text: 'z' },
      { id: 'a', type: 'note', x: 0, y: 0, width: 200, height: 100, ref: 'notes/a.md' },
    ],
    edges: [],
  }
}

function changed(canvas: ProjectCanvas, nodeId: string, x: number): ProjectCanvas {
  return { ...canvas, nodes: canvas.nodes.map(node => node.id === nodeId ? { ...node, x } : node) }
}

describe('CanvasViewport', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('round-trips coordinates and zooms around the pointer', () => {
    const viewport = new CanvasViewport({ x: 20, y: 30, zoom: 1 })
    viewport.setViewportSize({ width: 800, height: 600 })
    const canvasPoint = viewport.screenToCanvas({ x: 220, y: 230 })
    expect(viewport.canvasToScreen(canvasPoint)).toEqual({ x: 220, y: 230 })

    viewport.zoomAtScreenPoint({ x: 400, y: 300 }, 2)
    viewport.flush()
    expect(viewport.canvasToScreen(viewport.screenToCanvas({ x: 400, y: 300 }))).toEqual({ x: 400, y: 300 })
  })

  it('clamps invalid camera input, fits content, and separates overscan from hit bounds', () => {
    const viewport = new CanvasViewport({ x: Number.NaN, y: Infinity, zoom: -5 }, 200)
    viewport.setViewportSize({ width: 800, height: 600 })
    expect(viewport.getCamera()).toEqual({ x: 0, y: 0, zoom: 0.35 })
    viewport.fitToBounds({ minX: 0, minY: 0, maxX: 1000, maxY: 500 })
    viewport.flush()
    const snapshot = viewport.getSnapshot()
    expect(snapshot.renderBounds.minX).toBeLessThan(snapshot.hitTestBounds.minX)
    expect(snapshot.renderBounds.maxX).toBeGreaterThan(snapshot.hitTestBounds.maxX)
    expect(snapshot.camera.zoom).toBeGreaterThan(0.35)
  })
})

describe('CanvasSceneStore', () => {
  it('normalizes the scene, serializes deterministically, and spatially queries/hit-tests', () => {
    const store = new CanvasSceneStore(canvasWithNodes())
    expect(store.serialize().nodes.map(node => node.id)).toEqual(['a', 'project_overview', 'z'])
    expect(store.query({ minX: -10, minY: -10, maxX: 250, maxY: 120 }).map(node => node.id))
      .toContain('a')
    expect(store.query({ minX: 850, minY: 850, maxX: 1100, maxY: 1100 }).map(node => node.id))
      .toContain('z')
    expect(store.hitTest({ x: 20, y: 20 })?.id).toBe('project_overview')
  })
})

describe('CanvasSelectionManager and CanvasToolManager', () => {
  it('distinguishes selection, editing, and active gesture modes', () => {
    const selection = new CanvasSelectionManager()
    selection.selectNodes(['a'])
    expect(selection.getSnapshot().primary).toEqual({ kind: 'node', id: 'a' })
    selection.beginEditing('a')
    expect(selection.getSnapshot().mode).toBe('editing')
    selection.endEditing()
    expect(selection.getSnapshot().editingNodeId).toBeNull()

    const tools = new CanvasToolManager()
    tools.setSpacePressed(true)
    expect(tools.effectiveTool()).toBe('hand')
    tools.begin('drag', { point: { x: 10, y: 10 }, targetId: 'a' })
    expect(tools.getSnapshot().kind).toBe('pan')
    tools.update({ x: 30, y: 20 })
    expect(tools.getSnapshot().phase).toBe('active')
    expect(tools.commit().phase).toBe('committed')
    expect(tools.getSnapshot().phase).toBe('idle')
  })
})

describe('CanvasHistoryManager', () => {
  it('records one transaction per gesture and keeps document history separate', () => {
    const history = new CanvasHistoryManager()
    const initial = canvasWithNodes()
    const next = changed(initial, 'a', 100)
    expect(history.record('drag nodes', initial, next)).toBe(true)
    expect(history.canUndo).toBe(true)
    expect(history.undo(next)?.nodes.find(node => node.id === 'a')?.x).toBe(0)
    history.setActiveDomain('document')
    expect(history.record('BlockNote typing', initial, next, 'document')).toBe(false)
    expect(history.undo(next)).toBeNull()
  })
})

describe('Canvas layers, node specs, and overlays', () => {
  it('keeps graphics/document/overlay layers and stable screen-space controls', () => {
    const layers = new CanvasLayerManager()
    expect(layers.layers.map(layer => layer.kind)).toEqual(['graphics', 'document', 'overlay'])
    expect(layers.get('overlay').screenSpace).toBe(true)
    expect(new CanvasNodeSpecRegistry().has('paper_block')).toBe(true)

    const viewport = new CanvasViewport({ x: 10, y: 20, zoom: 0.5 })
    const overlays = new CanvasOverlayCoordinator()
    const rect = overlays.positionForNodes([{ id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 80 }], viewport)
    expect(rect).toEqual({ left: 10, top: 20, width: 50, height: 40 })
    expect(overlays.getSnapshot().handleSize).toBe(8)
  })
})

describe('ProjectCanvasController', () => {
  it('routes scene mutations through transactions, supports cancellation, and persists structural changes', async () => {
    const saved: ProjectCanvas[] = []
    const initial = canvasWithNodes()
    const readResult = (): ProjectCanvasReadResult => ({
      projectPath: initial.project,
      canvasPath: 'projects/alpha/project.canvas.json',
      state: 'ready',
      canvas: initial,
    })
    const resolveResult = (): ProjectCanvasResolveResult => ({
      projectPath: initial.project,
      canvasPath: 'projects/alpha/project.canvas.json',
      refs: [],
      diagnostics: [],
    })
    const persistence = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      deterministicWrites: false,
      read: async () => readResult(),
      create: async () => readResult(),
      resolve: async () => resolveResult(),
      save: async (_vault, _project, canvas) => {
        saved.push(canvas)
        return readResult()
      },
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence, migrateLoadedScene: false })
    await controller.load()
    controller.selectNodes(['a'])
    controller.beginNodeDrag('a', { x: 0, y: 0 })
    controller.updatePointer({ x: 100, y: 50 })
    controller.finishGesture()
    await vi.waitFor(() => expect(saved.length).toBeGreaterThan(0))
    expect(saved.at(-1)?.nodes.find(node => node.id === 'a')?.x).toBe(100)
    expect(controller.getSnapshot().canUndo).toBe(true)

    controller.beginNodeDrag('a', { x: 100, y: 50 })
    controller.updatePointer({ x: 200, y: 50 })
    controller.cancelGesture()
    expect(controller.getScene()?.nodes.find(node => node.id === 'a')?.x).toBe(100)
    controller.dispose()
  })
})
