import { defaultProjectCanvas, type ProjectCanvas, type ProjectCanvasReadResult } from './projectCanvas'
import {
  addNodeToProjectCanvas,
  type ProjectCanvasActionDependencies,
} from './projectCanvasActions'

const VAULT_PATH = '/vault'
const PROJECT_PATH = 'projects/agents.md'

function readyResult(canvas: ProjectCanvas): ProjectCanvasReadResult {
  return {
    projectPath: PROJECT_PATH,
    canvasPath: 'projects/agents.canvas.json',
    state: 'ready',
    canvas,
  }
}

function dependencies(initial: ProjectCanvasReadResult) {
  const create = vi.fn(async () => readyResult(defaultProjectCanvas(PROJECT_PATH)))
  const read = vi.fn(async () => initial)
  const save = vi.fn(async (_vaultPath: string, _projectPath: string, canvas: ProjectCanvas) => readyResult(canvas))
  const value: ProjectCanvasActionDependencies = { create, read, save }
  return { create, read, save, value }
}

describe('addNodeToProjectCanvas', () => {
  it('creates a missing canvas and adds a referenced node near the viewport center', async () => {
    const deps = dependencies({
      projectPath: PROJECT_PATH,
      canvasPath: 'projects/agents.canvas.json',
      state: 'missing',
      canvas: null,
    })

    const result = await addNodeToProjectCanvas({
      vaultPath: VAULT_PATH,
      projectPath: PROJECT_PATH,
      node: {
        type: 'paper',
        ref: 'papers/attention/paper.md',
        title: 'Attention Is All You Need',
      },
    }, deps.value)

    expect(deps.create).toHaveBeenCalledWith(VAULT_PATH, PROJECT_PATH)
    expect(deps.save).toHaveBeenCalledOnce()
    expect(result.createdCanvas).toBe(true)
    expect(result.duplicate).toBe(false)
    expect(result.node).toMatchObject({
      id: 'paper_1',
      type: 'paper',
      ref: 'papers/attention/paper.md',
      title: 'Attention Is All You Need',
      x: 330,
      y: 175,
    })
  })

  it('focuses an existing referenced node instead of adding a duplicate', async () => {
    const existing = {
      id: 'paper_1',
      type: 'paper' as const,
      ref: 'papers/attention/paper.md',
      title: 'Attention Is All You Need',
      x: 1200,
      y: 800,
      width: 240,
      height: 110,
    }
    const canvas: ProjectCanvas = {
      ...defaultProjectCanvas(PROJECT_PATH),
      nodes: [existing],
    }
    const deps = dependencies(readyResult(canvas))

    const result = await addNodeToProjectCanvas({
      vaultPath: VAULT_PATH,
      projectPath: PROJECT_PATH,
      node: {
        type: 'paper',
        ref: 'papers/attention/paper.md',
      },
    }, deps.value)

    expect(deps.create).not.toHaveBeenCalled()
    expect(result.duplicate).toBe(true)
    expect(result.canvas.nodes).toEqual([existing])
    expect(result.canvas.viewport).toEqual({ x: -870, y: -625, zoom: 1 })
  })

  it('normalizes absolute refs before duplicate detection', async () => {
    const canvas: ProjectCanvas = {
      ...defaultProjectCanvas(PROJECT_PATH),
      nodes: [{
        id: 'note_1',
        type: 'note',
        ref: 'notes/context.md',
        x: 0,
        y: 0,
        width: 240,
        height: 110,
      }],
    }
    const deps = dependencies(readyResult(canvas))

    const result = await addNodeToProjectCanvas({
      vaultPath: VAULT_PATH,
      projectPath: PROJECT_PATH,
      node: {
        type: 'note',
        ref: '/vault/notes/context.md',
      },
    }, deps.value)

    expect(result.duplicate).toBe(true)
    expect(result.canvas.nodes).toHaveLength(1)
  })

  it('does not deduplicate user-owned text cards without refs', async () => {
    const canvas: ProjectCanvas = {
      ...defaultProjectCanvas(PROJECT_PATH),
      nodes: [{
        id: 'text_1',
        type: 'text',
        text: 'Same thought',
        x: 0,
        y: 0,
        width: 240,
        height: 110,
      }],
    }
    const deps = dependencies(readyResult(canvas))

    const result = await addNodeToProjectCanvas({
      vaultPath: VAULT_PATH,
      projectPath: PROJECT_PATH,
      node: {
        type: 'text',
        text: 'Same thought',
      },
    }, deps.value)

    expect(result.duplicate).toBe(false)
    expect(result.canvas.nodes.map(node => node.id)).toEqual(['text_1', 'text_2'])
  })
})
