import {
  consumeProjectCanvasNavigate,
  consumeProjectCanvasOpen,
  pendingProjectCanvasNavigate,
  pendingProjectCanvasOpen,
  requestProjectCanvasNavigate,
  requestProjectCanvasOpen,
} from './projectCanvasNavigation'

describe('Project Canvas navigation intent', () => {
  it('keeps an intent until the matching Project Canvas consumes it', () => {
    requestProjectCanvasOpen({ projectPath: 'projects/agents.md', nodeId: 'paper_2' })

    expect(pendingProjectCanvasOpen('projects/other.md')).toBeNull()
    expect(pendingProjectCanvasOpen('projects/agents.md')).toEqual({
      projectPath: 'projects/agents.md',
      nodeId: 'paper_2',
    })
    expect(consumeProjectCanvasOpen('projects/agents.md')).toEqual({
      projectPath: 'projects/agents.md',
      nodeId: 'paper_2',
    })
    expect(pendingProjectCanvasOpen('projects/agents.md')).toBeNull()
  })

  it('keeps a document target until the matching Project Canvas consumes it', () => {
    requestProjectCanvasNavigate({
      projectPath: 'projects/agents.md',
      target: 'papers/attention/paper.md',
    })

    expect(pendingProjectCanvasNavigate('projects/other.md')).toBeNull()
    expect(consumeProjectCanvasNavigate('projects/agents.md')).toEqual({
      projectPath: 'projects/agents.md',
      target: 'papers/attention/paper.md',
    })
    expect(pendingProjectCanvasNavigate('projects/agents.md')).toBeNull()
  })
})
