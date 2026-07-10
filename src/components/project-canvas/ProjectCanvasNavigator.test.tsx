import { fireEvent, render, screen } from '@testing-library/react'
import { PROJECT_OVERVIEW_NODE_ID, type ProjectCanvasNode } from '../../projectCanvas'
import { ProjectCanvasNavigator } from './ProjectCanvasNavigator'

function node(overrides: Partial<ProjectCanvasNode>): ProjectCanvasNode {
  return {
    id: 'note_1',
    type: 'note',
    x: 0,
    y: 0,
    width: 240,
    height: 160,
    title: 'Research Note',
    ...overrides,
  }
}

describe('ProjectCanvasNavigator', () => {
  it('derives grouped Project membership and focuses the selected item', () => {
    const overview = node({ id: PROJECT_OVERVIEW_NODE_ID, title: 'Project Overview' })
    const paper = node({ id: 'paper_1', type: 'paper', title: 'Attention Is All You Need' })
    const evidence = node({ id: 'block_1', type: 'paper_block', title: 'Core claim' })
    const onFocusNode = vi.fn()

    render(
      <ProjectCanvasNavigator
        locale="en"
        nodes={[overview, paper, evidence]}
        selectedNodeId="paper_1"
        onFocusNode={onFocusNode}
      />,
    )

    expect(screen.getByRole('navigation', { name: 'Project navigator' })).toBeInTheDocument()
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Paper')).toBeInTheDocument()
    expect(screen.getByText('Evidence')).toBeInTheDocument()
    expect(screen.getByTestId('project-canvas-navigator-node-paper_1')).toHaveAttribute('aria-current', 'true')

    fireEvent.click(screen.getByTestId('project-canvas-navigator-node-block_1'))

    expect(onFocusNode).toHaveBeenCalledWith(evidence)
  })
})
