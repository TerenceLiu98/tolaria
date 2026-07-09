import { defaultProjectCanvas } from '../projectCanvas'
import { makeEntry } from '../test-utils/noteListTestUtils'
import { loadProjectCanvasAiContext } from './useProjectCanvasAiContext'

const project = makeEntry({ isA: 'Project', path: '/vault/projects/agents.md', title: 'Agents' })

describe('loadProjectCanvasAiContext', () => {
  it('loads and resolves an active Project Canvas through the command boundary', async () => {
    const canvas = {
      ...defaultProjectCanvas(project.path),
      nodes: [{ id: 'task_1', type: 'task' as const, text: 'Read paper', completed: false, x: 0, y: 0, width: 240, height: 110 }],
    }
    const read = vi.fn(async () => ({
      projectPath: project.path,
      canvasPath: '/vault/projects/agents.canvas.json',
      state: 'ready' as const,
      canvas,
    }))
    const resolve = vi.fn(async () => ({
      projectPath: project.path,
      canvasPath: '/vault/projects/agents.canvas.json',
      refs: [],
      diagnostics: [],
    }))

    const context = await loadProjectCanvasAiContext({
      activeEntry: project,
      entries: [project],
      selectedNodeId: 'task_1',
      vaultPath: '/vault',
    }, {
      read,
      readBlock: vi.fn(),
      resolve,
    })

    expect(read).toHaveBeenCalledWith('/vault', project.path)
    expect(resolve).toHaveBeenCalledWith('/vault', project.path, canvas)
    expect(context?.selectedNode).toMatchObject({ id: 'task_1', completed: false })
  })

  it('returns no Project context for ordinary Notes or missing canvases', async () => {
    const deps = {
      read: vi.fn(async () => ({ projectPath: project.path, canvasPath: '', state: 'missing' as const, canvas: null })),
      readBlock: vi.fn(),
      resolve: vi.fn(),
    }

    expect(await loadProjectCanvasAiContext({
      activeEntry: makeEntry({ isA: 'Note' }),
      entries: [],
      selectedNodeId: null,
      vaultPath: '/vault',
    }, deps)).toBeNull()
    expect(await loadProjectCanvasAiContext({
      activeEntry: project,
      entries: [project],
      selectedNodeId: null,
      vaultPath: '/vault',
    }, deps)).toBeNull()
  })
})
