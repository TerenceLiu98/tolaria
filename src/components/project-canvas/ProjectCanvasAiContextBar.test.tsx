import { fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '../ui/tooltip'
import { ProjectCanvasAiContextBar } from './ProjectCanvasAiContextBar'
import type { ProjectCanvasAiContext } from '../../projectCanvasAiContext'

const context: ProjectCanvasAiContext = {
  project: { id: 'agents', path: '/vault/projects/agents.md', title: 'Agent Research' },
  summary: {
    citedBlockCount: 2,
    edgeCount: 4,
    nodeCount: 7,
    referencedPaperCount: 3,
    staleReferenceCount: 1,
  },
  selectedNode: { id: 'claim_1', type: 'text', title: 'Core claim' },
  nearbyNodes: [],
  relationships: [],
  papers: [],
  citedBlocks: [],
  notes: [],
}

describe('ProjectCanvasAiContextBar', () => {
  it('shows stable Project tool and context visibility', () => {
    render(
      <TooltipProvider>
        <ProjectCanvasAiContextBar context={context} />
      </TooltipProvider>,
    )

    expect(screen.getByTestId('ai-project-tools-available')).toHaveTextContent('Project tools available')
    expect(screen.getByTestId('ai-project-context-preview')).toHaveTextContent('Agent Research')
    expect(screen.getByTestId('ai-project-context-preview')).toHaveTextContent('Core claim')
    expect(screen.getByTestId('ai-project-paper-count')).toHaveTextContent('3')
    expect(screen.getByTestId('ai-project-citation-count')).toHaveTextContent('2')
    expect(screen.getByTestId('ai-project-stale-count')).toHaveTextContent('1')
  })

  it('offers the three Project AI actions from a compact menu', async () => {
    const onAction = vi.fn()
    render(
      <TooltipProvider>
        <ProjectCanvasAiContextBar context={context} onAction={onAction} />
      </TooltipProvider>,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Project AI actions' }), { button: 0 })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Generate Cited Outline' }))

    expect(onAction).toHaveBeenCalledWith('cited_outline')
  })
})
