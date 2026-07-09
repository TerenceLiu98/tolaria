import {
  projectCanvasSelectionSnapshot,
  publishProjectCanvasSelection,
  subscribeProjectCanvasSelection,
} from './projectCanvasSelectionStore'

describe('Project Canvas selection store', () => {
  it('publishes the active Project and selected node without note content', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeProjectCanvasSelection(listener)

    publishProjectCanvasSelection({ projectPath: '/vault/projects/agents.md', nodeId: 'paper_1' })

    expect(projectCanvasSelectionSnapshot()).toEqual({
      projectPath: '/vault/projects/agents.md',
      nodeId: 'paper_1',
    })
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })
})
