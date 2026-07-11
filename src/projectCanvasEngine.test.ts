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
    viewport.setViewportSize({ width: 800, height: 600, left: 100, top: 50 })
    const canvasPoint = viewport.screenToCanvas({ x: 220, y: 230 })
    expect(viewport.canvasToScreen(canvasPoint)).toEqual({ x: 220, y: 230 })
    expect(viewport.clientToCanvas({ x: 320, y: 280 })).toEqual(canvasPoint)
    expect(viewport.canvasCenter(200, 100)).toEqual({ x: 280, y: 220 })

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

  it('derives deterministic graphics bounds from scene bounds', () => {
    const viewport = new CanvasViewport()
    expect(viewport.graphicsBounds(null)).toEqual({ minX: -400, minY: -300, width: 1200, height: 900 })
    expect(viewport.graphicsBounds({ minX: 0, minY: 10, maxX: 1400, maxY: 1100 })).toEqual({
      minX: -240,
      minY: -230,
      width: 1880,
      height: 1570,
    })
  })
})

describe('CanvasSceneStore', () => {
  it('keeps 1,000-node viewport queries bounded', () => {
    const nodes = Array.from({ length: 1000 }, (_, index) => ({
      id: `node-${index}`,
      type: 'text' as const,
      x: (index % 50) * 80,
      y: Math.floor(index / 50) * 80,
      width: 48,
      height: 48,
    }))
    const store = new CanvasSceneStore({ ...defaultProjectCanvas('projects/medium/project.md'), nodes, edges: [] })
    store.query({ minX: 800, minY: 800, maxX: 850, maxY: 850 })
    expect(store.getDiagnostics().lastQueryCandidates).toBeLessThan(1000)
  })

  it('queries a deterministic 5,000-node scene through spatial candidates', () => {
    const nodes = Array.from({ length: 5000 }, (_, index) => ({
      id: `node-${String(index).padStart(4, '0')}`,
      type: 'text' as const,
      x: (index % 100) * 80,
      y: Math.floor(index / 100) * 80,
      width: 48,
      height: 48,
    }))
    const store = new CanvasSceneStore({
      ...defaultProjectCanvas('projects/large/project.md'),
      nodes,
      edges: [],
    })

    const result = store.query({ minX: 1600, minY: 1600, maxX: 1650, maxY: 1650 })
    expect(result.map(node => node.id)).toEqual(['node-2020'])
    expect(store.getDiagnostics().lastQueryCandidates).toBeLessThan(500)
  })

  it('normalizes the scene, serializes deterministically, and spatially queries/hit-tests', () => {
    const store = new CanvasSceneStore(canvasWithNodes())
    expect(store.serialize().nodes.map(node => node.id)).toEqual(['a', 'project_overview', 'z'])
    expect(store.query({ minX: -10, minY: -10, maxX: 250, maxY: 120 }).map(node => node.id))
      .toContain('a')
    expect(store.query({ minX: 850, minY: 850, maxX: 1100, maxY: 1100 }).map(node => node.id))
      .toContain('z')
    expect(store.hitTest({ x: 20, y: 20 })?.id).toBe('project_overview')
  })

  it('retains active nodes outside the rendered viewport', () => {
    const store = new CanvasSceneStore(canvasWithNodes())

    expect(store.query(
      { minX: -10, minY: -10, maxX: 250, maxY: 120 },
      new Set(['z']),
    ).map(node => node.id)).toContain('z')
  })

  it('retains connected nodes through the adjacency index without scanning the scene', () => {
    const canvas = canvasWithNodes()
    canvas.edges = [{ id: 'edge', from: 'a', to: 'z', kind: 'related' }]
    const store = new CanvasSceneStore(canvas)

    expect(store.connectedNodeIds(new Set(['a']))).toEqual(['z'])
    expect(store.query({ minX: 700, minY: 700, maxX: 1100, maxY: 1100 }, new Set(['a', 'z'])).map(node => node.id))
      .toEqual(['a', 'z'])
  })

  it('updates node geometry and spatial cells without rebuilding the full scene', () => {
    const store = new CanvasSceneStore(canvasWithNodes())
    const initialRebuilds = store.getDiagnostics().fullRebuilds

    store.patchNodeGeometry([{ id: 'a', x: 700, y: 100 }])

    expect(store.query({ minX: -10, minY: -10, maxX: 250, maxY: 120 }).map(node => node.id))
      .not.toContain('a')
    expect(store.query({ minX: 650, minY: 50, maxX: 950, maxY: 250 }).map(node => node.id))
      .toContain('a')
    expect(store.getDiagnostics()).toMatchObject({
      fullRebuilds: initialRebuilds,
      geometryPatchBatches: 1,
      geometryPatchedNodes: 1,
    })
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
    const specs = new CanvasNodeSpecRegistry()
    expect(['note', 'paper', 'paper_block', 'image', 'text', 'task', 'group'].every(type => specs.has(type as ProjectCanvas['nodes'][number]['type']))).toBe(true)
    expect(specs.getForNode({ id: 'project_overview', type: 'note', x: 0, y: 0, width: 10, height: 10 }).key).toBe('overview')
    expect(specs.get('image').clipboard({ id: 'image', type: 'image', x: 0, y: 0, width: 10, height: 10 })).not.toBeNull()
    expect(specs.get('note').renderer).toBe('document')
    expect(specs.get('overview').renderer).toBe('document')
    expect(specs.get('note').editorGeometry).toMatchObject({ width: 560, height: 420 })
    expect(specs.get('task').toolbarActions).toContain('toggle-complete')
    expect(specs.get('task').toolbarActions).toEqual(expect.arrayContaining(['connect', 'resize', 'toggle-complete', 'delete']))
    expect(specs.get('paper_block').resolveDrop('@block[attention#b001]')).toEqual({ ref: '@block[attention#b001]' })
    expect(specs.get('image').resolveDrop('figure.png')).toEqual({ ref: 'figure.png', title: 'figure.png' })
    expect(specs.get('text').resolveDrop('plain text')).toEqual({ text: 'plain text' })

    const viewport = new CanvasViewport({ x: 10, y: 20, zoom: 0.5 })
    viewport.setViewportSize({ width: 400, height: 300 })
    const overlays = new CanvasOverlayCoordinator()
    overlays.setViewportBounds({ left: 0, top: 0, width: 400, height: 300 })
    const rect = overlays.positionForNodes([{ id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 80 }], viewport)
    expect(rect).toEqual({ left: 10, top: 20, width: 50, height: 40 })
    expect(overlays.getSnapshot().handleSize).toBe(8)
    expect(overlays.getSnapshot().zOrder).toEqual(['selection', 'snap', 'resize', 'connection', 'toolbar', 'comment', 'menu'])
    expect(overlays.getSnapshot().zIndices.toolbar).toBe(overlays.zIndexFor('toolbar'))
    expect(overlays.zIndexFor('toolbar')).toBeGreaterThan(overlays.zIndexFor('selection'))
    overlays.setActive(['selection', 'toolbar', 'menu'], false)
    overlays.setFocusOwner('overlay')
    expect(overlays.getSnapshot().focusOwner).toBe('overlay')
    expect(overlays.dismissTop()).toBe('menu')
    expect(overlays.getSnapshot().handles).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'connect', nodeId: 'a', left: 60, top: 40 }),
      expect.objectContaining({ kind: 'resize', nodeId: 'a', left: 60, top: 60 }),
    ]))
    expect(overlays.positionForNodes([{ id: 'offscreen', type: 'text', x: -100, y: 0, width: 100, height: 80 }], viewport)).toEqual({
      left: 0,
      top: 20,
      width: 10,
      height: 40,
    })
  })

  it('publishes snap guides from spatial candidates only during an active drag', async () => {
    const initial = {
      ...canvasWithNodes(),
      nodes: [
        { id: 'moving', type: 'text' as const, x: 0, y: 0, width: 100, height: 100 },
        { id: 'target', type: 'text' as const, x: 220, y: 120, width: 100, height: 100 },
      ],
      edges: [],
    }
    const adapter = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      migrateOnLoad: false,
      deterministicWrites: false,
      read: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      create: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      resolve: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas }),
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence: adapter, migrateLoadedScene: false })
    await controller.load()
    controller.setViewportSize({ width: 800, height: 600 })
    controller.selectNodes(['moving'])
    controller.beginNodeDrag('moving', { x: 50, y: 50 })
    controller.updatePointer({ x: 165, y: 165 })

    expect(controller.getSnapshot().overlay.snapGuides).toEqual(expect.arrayContaining([
      expect.objectContaining({ orientation: 'vertical' }),
      expect.objectContaining({ orientation: 'horizontal' }),
    ]))
    expect(controller.getScene()?.nodes.find(node => node.id === 'moving')).toMatchObject({ x: 120, y: 120 })

    controller.finishGesture()
    expect(controller.getSnapshot().overlay.snapGuides).toEqual([])
    controller.dispose()
  })

  it('snaps resize edges and restores the original geometry on cancellation', async () => {
    const initial = {
      ...canvasWithNodes(),
      nodes: [
        { id: 'moving', type: 'text' as const, x: 0, y: 0, width: 100, height: 100 },
        { id: 'target', type: 'text' as const, x: 220, y: 120, width: 100, height: 100 },
      ],
      edges: [],
    }
    const adapter = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      migrateOnLoad: false,
      deterministicWrites: false,
      read: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      create: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      resolve: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas }),
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence: adapter, migrateLoadedScene: false })
    await controller.load()
    controller.setViewportSize({ width: 800, height: 600 })
    controller.beginNodeResize('moving', { x: 100, y: 100 })
    controller.updatePointer({ x: 219, y: 219 })
    expect(controller.getSnapshot().overlay.snapGuides.length).toBeGreaterThan(0)
    expect(controller.getScene()?.nodes.find(node => node.id === 'moving')).toMatchObject({ width: 220, height: 220 })
    controller.cancelGesture()
    expect(controller.getSnapshot().overlay.snapGuides).toEqual([])
    expect(controller.getScene()?.nodes.find(node => node.id === 'moving')).toMatchObject({ width: 100, height: 100 })
    controller.dispose()
  })

  it('dismisses overlay chrome without clearing selection and routes toolbar actions through the controller', async () => {
    const initial = canvasWithNodes()
    const adapter = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      migrateOnLoad: false,
      deterministicWrites: false,
      read: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      create: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      resolve: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas }),
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence: adapter, migrateLoadedScene: false })
    await controller.load()
    controller.selectNodes(['a'])
    expect(controller.getSnapshot().overlay.toolbarRect).not.toBeNull()
    expect(controller.dismissOverlayOutside({ x: 700, y: 500 })).toBe(true)
    expect(controller.getSnapshot().selection.primary).toEqual({ kind: 'node', id: 'a' })
    expect(controller.getSnapshot().overlay.toolbarRect).toBeNull()
    controller.executeNodeToolbarAction('delete', 'a')
    expect(controller.getScene()?.nodes.some(node => node.id === 'a')).toBe(false)
    controller.dispose()
  })

  it('enforces low-zoom budgets while retaining active nodes', () => {
    const layers = new CanvasLayerManager()
    const nodes = Array.from({ length: 200 }, (_, index) => ({
      id: `node-${index}`,
      type: 'text' as const,
      x: index * 10,
      y: 0,
      width: 8,
      height: 8,
    }))
    const visible = layers.filterNodes(nodes, 0.4, new Set(['node-199']))
    expect(visible).toHaveLength(181)
    expect(visible.at(-1)?.id).toBe('node-199')
  })

  it('retains active, connected, and overlay-owned nodes in a 5,000-node low-zoom scene', () => {
    const layers = new CanvasLayerManager()
    const nodes = Array.from({ length: 5000 }, (_, index) => ({
      id: `node-${index}`,
      type: 'text' as const,
      x: index * 10,
      y: 0,
      width: 8,
      height: 8,
    }))
    const retained = new Set(['node-4900', 'node-4901', 'node-4902', 'node-4903'])
    const visible = layers.filterNodes(nodes, 0.4, retained)
    expect(visible).toHaveLength(184)
    expect(visible.map(node => node.id)).toEqual(expect.arrayContaining([...retained]))
  })
})

describe('ProjectCanvasPersistenceAdapter', () => {
  it('migrates on read, writes deterministic structural state, and debounces viewport state', async () => {
    vi.useFakeTimers()
    const source = canvasWithNodes()
    const saved: ProjectCanvas[] = []
    const adapter = new ProjectCanvasPersistenceAdapter({
      vaultPath: '/vault',
      projectPath: source.project,
      read: async () => ({
        projectPath: source.project,
        canvasPath: 'projects/alpha/project.canvas.json',
        state: 'ready' as const,
        canvas: source,
      }),
      create: async () => ({
        projectPath: source.project,
        canvasPath: 'projects/alpha/project.canvas.json',
        state: 'ready' as const,
        canvas: source,
      }),
      resolve: async () => ({ projectPath: source.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => {
        saved.push(canvas)
        return {
          projectPath: source.project,
          canvasPath: 'projects/alpha/project.canvas.json',
          state: 'ready' as const,
          canvas,
        }
      },
      viewportDebounceMs: 100,
    })

    const loaded = await adapter.load()
    expect(loaded.result.canvas?.nodes.map(node => node.id)).toEqual(['a', 'project_overview', 'z'])

    const unsorted = { ...source, nodes: [...source.nodes].reverse(), edges: [...source.edges].reverse() }
    const viewportWrite = adapter.persist(unsorted, 'viewport')
    await vi.advanceTimersByTimeAsync(99)
    expect(saved).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    await viewportWrite
    expect(saved.at(-1)?.nodes.map(node => node.id)).toEqual(['a', 'project_overview', 'z'])

    const next = { ...unsorted, viewport: { x: 42, y: 24, zoom: 0.8 } }
    const pendingViewport = adapter.persist(unsorted, 'viewport')
    const structural = await adapter.persist(next, 'structural')
    await pendingViewport
    expect(structural?.canvas?.viewport).toEqual(next.viewport)
    expect(saved).toHaveLength(2)
    vi.useRealTimers()
  })
})

describe('ProjectCanvasController', () => {
  it('uses actual focus ownership for undo and preserves Canvas history across editor focus transitions', async () => {
    const initial = canvasWithNodes()
    const persistence = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      deterministicWrites: false,
      read: async () => ({
        projectPath: initial.project,
        canvasPath: 'projects/alpha/project.canvas.json',
        state: 'ready' as const,
        canvas: initial,
      }),
      create: async () => ({
        projectPath: initial.project,
        canvasPath: 'projects/alpha/project.canvas.json',
        state: 'ready' as const,
        canvas: initial,
      }),
      resolve: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => ({
        projectPath: initial.project,
        canvasPath: 'projects/alpha/project.canvas.json',
        state: 'ready' as const,
        canvas,
      }),
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence, migrateLoadedScene: false })
    await controller.load()

    controller.updateNode('a', { x: 100 }, true)
    expect(controller.getSnapshot().historyDomain).toBe('canvas')
    controller.setFocusOwner('document')
    expect(controller.getSnapshot().historyDomain).toBe('document')
    expect(controller.undo()).toBeNull()
    controller.setFocusOwner('canvas')
    expect(controller.getSnapshot().historyDomain).toBe('canvas')
    expect(controller.undo()?.nodes.find(node => node.id === 'a')?.x).toBe(0)

    controller.setFocusOwner('document')
    controller.setFocusOwner('canvas')
    expect(controller.redo()?.nodes.find(node => node.id === 'a')?.x).toBe(100)
    controller.dispose()
  })

  it('constructs add and drop nodes through the controller using NodeSpec geometry', async () => {
    const initial = canvasWithNodes()
    const persistence = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      deterministicWrites: false,
      read: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      create: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      resolve: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas }),
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence, migrateLoadedScene: false })
    await controller.load()

    const task = controller.createNode({ type: 'task', center: { x: 500, y: 400 }, text: 'Review' })
    expect(task?.nodes.find(node => node.type === 'task')).toMatchObject({ x: 370, y: 325, width: 260, height: 150, text: 'Review' })
    const image = controller.addDropValue('figure.png', { x: 800, y: 500 })
    expect(image?.nodes.find(node => node.type === 'image')).toMatchObject({ ref: 'figure.png', title: 'figure.png' })
    const peek = controller.createPeekNode('note', 'notes/peek.md', 'Peek', 'a')
    expect(peek).toMatchObject({ type: 'note', ref: 'notes/peek.md', width: 560, height: 420, x: 280, y: 0 })
    controller.dispose()
  })

  it('retains selected, editing, connected, and overlay-owned nodes outside the render bounds', async () => {
    const initial = {
      ...canvasWithNodes(),
      nodes: [
        { id: 'selected', type: 'text' as const, x: 0, y: 0, width: 100, height: 100 },
        { id: 'connected', type: 'text' as const, x: 5000, y: 0, width: 100, height: 100 },
        { id: 'editing', type: 'text' as const, x: 6000, y: 0, width: 100, height: 100 },
        { id: 'overlay', type: 'text' as const, x: 7000, y: 0, width: 100, height: 100 },
      ],
      edges: [{ id: 'edge-1', from: 'selected', to: 'connected', kind: 'related' as const }],
    }
    const persistence = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      deterministicWrites: false,
      read: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      create: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      resolve: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas }),
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence, migrateLoadedScene: false })
    await controller.load()
    controller.setViewportSize({ width: 300, height: 200 })
    controller.selectNodes(['selected'])
    const selectedIds = controller.queryVisibleNodes().map(node => node.id)
    expect(selectedIds).toEqual(expect.arrayContaining(['selected', 'connected']))
    controller.beginEditing('editing')
    controller.setOverlayOwnedNodes(['overlay'])
    const activeIds = controller.queryVisibleNodes().map(node => node.id)
    expect(activeIds).toEqual(expect.arrayContaining(['editing', 'overlay']))
    controller.dispose()
  })

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
      refs: [{
        nodeId: 'a',
        nodeType: 'note',
        ref: 'notes/a.md',
        state: 'resolved',
        targetPath: 'notes/a.md',
      }],
      diagnostics: [],
    })
    const resolve = vi.fn(async () => resolveResult())
    const persistence = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      deterministicWrites: false,
      read: async () => readResult(),
      create: async () => readResult(),
      resolve,
      save: async (_vault, _project, canvas) => {
        saved.push(canvas)
        return readResult()
      },
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence, migrateLoadedScene: false })
    await controller.load()
    expect(controller.getSnapshot().refs).toEqual(resolveResult().refs)
    const initialRebuilds = controller.getSceneDiagnostics()?.fullRebuilds
    controller.selectNodes(['a'])
    controller.beginNodeDrag('a', { x: 0, y: 0 })
    controller.updatePointer({ x: 100, y: 50 })
    controller.updatePointer({ x: 120, y: 50 })
    expect(controller.getSceneDiagnostics()).toMatchObject({
      fullRebuilds: initialRebuilds,
      geometryPatchBatches: 2,
    })
    controller.finishGesture()
    await vi.waitFor(() => expect(saved.length).toBeGreaterThan(0))
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(2))
    expect(saved.at(-1)?.nodes.find(node => node.id === 'a')?.x).toBe(120)
    expect(controller.getSnapshot().canUndo).toBe(true)

    expect(controller.undo()?.nodes.find(node => node.id === 'a')?.x).toBe(0)
    expect(controller.getSnapshot().canUndo).toBe(false)

    controller.beginNodeDrag('a', { x: 0, y: 50 })
    controller.updatePointer({ x: 80, y: 50 })
    controller.cancelGesture()
    expect(controller.getScene()?.nodes.find(node => node.id === 'a')?.x).toBe(0)

    controller.beginPan({ x: 50, y: 50 })
    controller.updatePointer({ x: 120, y: 80 })
    controller.cancelGesture()
    expect(controller.getSnapshot().viewport.camera).toEqual(initial.viewport)
    controller.dispose()
  })
})
