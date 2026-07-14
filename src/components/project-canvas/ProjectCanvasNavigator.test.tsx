import { fireEvent, render, screen } from '@testing-library/react'
import { CanvasNodeSpecRegistry } from '../../canvasNodeSpecRegistry'
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
  const specs = new CanvasNodeSpecRegistry()

  it('derives grouped Project membership and focuses the selected item', () => {
    const overview = node({ id: PROJECT_OVERVIEW_NODE_ID, title: 'Project Overview' })
    const paper = node({ id: 'paper_1', type: 'paper', title: 'Attention Is All You Need' })
    const evidence = node({ id: 'block_1', type: 'paper_block', title: 'Core claim' })
    const onFocusNode = vi.fn()

    render(
      <ProjectCanvasNavigator
        locale="en"
        nodes={[overview, paper, evidence]}
        specs={specs}
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

  it('moves keyboard focus between virtualized node rows without changing selection', () => {
    const overview = node({ id: PROJECT_OVERVIEW_NODE_ID, title: 'Project Overview' })
    const noteOne = node({ id: 'note_1', title: 'Alpha note' })
    const noteTwo = node({ id: 'note_2', title: 'Beta note' })
    const paper = node({ id: 'paper_1', type: 'paper', title: 'Research paper' })
    const group = node({ id: 'group_1', type: 'group', title: 'Last group' })
    const onFocusNode = vi.fn()

    render(
      <ProjectCanvasNavigator
        locale="en"
        nodes={[overview, paper, noteTwo, group, noteOne]}
        specs={specs}
        selectedNodeId="note_1"
        onFocusNode={onFocusNode}
      />,
    )

    const firstNote = screen.getByTestId('project-canvas-navigator-node-note_1')
    const secondNote = screen.getByTestId('project-canvas-navigator-node-note_2')
    const lastNode = screen.getByTestId('project-canvas-navigator-node-group_1')
    firstNote.focus()

    fireEvent.keyDown(firstNote, { key: 'ArrowDown' })
    expect(secondNote).toHaveFocus()

    fireEvent.keyDown(secondNote, { key: 'ArrowUp' })
    expect(firstNote).toHaveFocus()

    fireEvent.keyDown(firstNote, { key: 'End' })
    expect(lastNode).toHaveFocus()

    fireEvent.keyDown(lastNode, { key: ' ' })
    expect(onFocusNode).toHaveBeenCalledWith(group)
    onFocusNode.mockClear()

    fireEvent.keyDown(lastNode, { key: 'Home' })
    expect(screen.getByTestId(`project-canvas-navigator-node-${PROJECT_OVERVIEW_NODE_ID}`)).toHaveFocus()
    expect(onFocusNode).not.toHaveBeenCalled()

    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    expect(onFocusNode).toHaveBeenCalledWith(overview)
  })

  it('derives section order, labels, and icons from NodeSpec navigation behavior', () => {
    const customSpecs = CanvasNodeSpecRegistry.defaults().map(spec => spec.key === 'text'
      ? {
          ...spec,
          navigator: {
            icon: 'paper' as const,
            order: 5,
            sectionKey: 'projectCanvas.navigator.evidence' as const,
          },
        }
      : spec)
    render(
      <ProjectCanvasNavigator
        locale="en"
        nodes={[
          node({ id: 'note_1', type: 'note', title: 'Later note' }),
          node({ id: 'text_1', type: 'text', title: 'First text' }),
        ]}
        specs={new CanvasNodeSpecRegistry(customSpecs)}
        selectedNodeId={null}
        onFocusNode={vi.fn()}
      />,
    )

    const rows = screen.getAllByTestId(/^project-canvas-navigator-node-/u)
    expect(rows.map(row => row.getAttribute('data-testid'))).toEqual([
      'project-canvas-navigator-node-text_1',
      'project-canvas-navigator-node-note_1',
    ])
    expect(rows[0]).toHaveAttribute('data-node-icon', 'paper')
    expect(screen.getByText('Evidence')).toBeInTheDocument()
  })
})
