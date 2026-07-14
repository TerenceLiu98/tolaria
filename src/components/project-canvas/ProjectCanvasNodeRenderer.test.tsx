import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { CanvasNodeSpecRegistry } from '../../canvasNodeSpecRegistry'
import { defaultProjectCanvas, type ProjectCanvasNode } from '../../projectCanvas'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import { ProjectCanvasInspector } from './ProjectCanvasInspector'
import { ProjectCanvasNodeCard } from './ProjectCanvasNodeCard'
import {
  ProjectCanvasNodeRendererRegistry,
  projectCanvasNodeRendererRegistry,
  type ProjectCanvasNodeRendererProps,
} from './ProjectCanvasNodeRenderer'

vi.mock('./ProjectDocumentPreview', () => ({
  ProjectDocumentPreview: ({ active, entry }: { active: boolean; entry: { title: string } }) => active
    ? <div data-testid="project-document-preview">{entry.title}</div>
    : null,
}))

const specs = new CanvasNodeSpecRegistry()
const baseNode: ProjectCanvasNode = {
  height: 120,
  id: 'node',
  type: 'text',
  width: 220,
  x: 20,
  y: 30,
}

function renderCard(
  node: ProjectCanvasNode,
  options: {
    entry?: ReturnType<typeof makeEntry> | null
    onTextChange?: (text: string) => void
    onToggleTask?: () => void
    presentation?: 'card' | 'overview' | 'preview'
    registry?: ProjectCanvasNodeRendererRegistry
  } = {},
) {
  return render(
    <ProjectCanvasNodeCard
      editing={false}
      entry={options.entry ?? null}
      locale="en"
      node={node}
      spec={specs.getForNode(node)}
      onClick={vi.fn()}
      onDoubleClick={vi.fn()}
      onNavigateWikilink={vi.fn()}
      onPointerDown={vi.fn()}
      onSelect={vi.fn()}
      onTextBlur={vi.fn()}
      onTextChange={options.onTextChange ?? vi.fn()}
      onToggleTask={options.onToggleTask ?? vi.fn()}
      presentation={options.presentation ?? 'card'}
      rendererRegistry={options.registry}
      selected={false}
      vaultPath="/vault"
    />,
  )
}

describe('ProjectCanvasNodeRendererRegistry', () => {
  it('registers a concrete renderer for every default NodeSpec', () => {
    const expected = [...new Set(CanvasNodeSpecRegistry.defaults().map(spec => spec.rendererAdapter.key))].sort()

    expect(projectCanvasNodeRendererRegistry.keys().sort()).toEqual(expected)
  })

  it('lets the selected NodeSpec dispatch rendering without NodeCard type branches', () => {
    const renderer = vi.fn(() => <div>Owned by the text NodeSpec renderer</div>)
    const registry = new ProjectCanvasNodeRendererRegistry([
      ['text', renderer as ComponentType<ProjectCanvasNodeRendererProps>],
    ])

    renderCard({ ...baseNode, text: 'Original text', zIndex: 7 }, { registry })

    expect(screen.getByText('Owned by the text NodeSpec renderer')).toBeInTheDocument()
    expect(screen.getByTestId('project-canvas-node')).toHaveStyle({ zIndex: '7' })
    expect(renderer).toHaveBeenCalledOnce()
  })

  it('preserves document, citation, image, text, task, and group behavior', () => {
    const note = makeEntry({ isA: 'Note', path: '/vault/note.md', snippet: 'Document card snippet', title: 'Document body' })
    const { unmount } = renderCard(
      { ...baseNode, id: 'note', type: 'note', ref: 'note.md' },
      { entry: note },
    )
    expect(screen.getByText('Document card snippet')).toBeInTheDocument()
    unmount()

    const overview = renderCard(
      { ...baseNode, id: 'project_overview', type: 'note', ref: 'project.md' },
      { entry: note, presentation: 'preview' },
    )
    expect(screen.getByTestId('project-document-preview')).toHaveTextContent('Document body')
    overview.unmount()

    const documentPreview = renderCard(
      { ...baseNode, id: 'paper', type: 'paper', ref: 'paper.md' },
      { entry: note, presentation: 'preview' },
    )
    expect(screen.getByTestId('project-document-preview')).toHaveTextContent('Document body')
    documentPreview.unmount()

    const citation = renderCard({
      ...baseNode,
      id: 'citation',
      ref: '@block[paper#b001]',
      text: 'Exact cited evidence',
      type: 'paper_block',
    })
    expect(screen.getByText('Exact cited evidence')).toBeInTheDocument()
    citation.unmount()

    const image = renderCard({
      ...baseNode,
      id: 'image',
      ref: 'assets/figure.png',
      title: 'Figure',
      type: 'image',
    })
    expect(screen.getByRole('img', { name: 'Figure' })).toHaveAttribute('loading', 'lazy')
    image.unmount()

    const changeText = vi.fn()
    const text = renderCard({ ...baseNode, text: 'Canvas text' }, { onTextChange: changeText })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Changed text' } })
    expect(changeText).toHaveBeenCalledWith('Changed text')
    text.unmount()

    const toggleTask = vi.fn()
    const task = renderCard({ ...baseNode, completed: false, text: 'Do this', type: 'task' }, { onToggleTask: toggleTask })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(toggleTask).toHaveBeenCalledOnce()
    task.unmount()

    renderCard({ ...baseNode, text: 'Group label', type: 'group' })
    expect(screen.getByRole('textbox')).toHaveValue('Group label')
  })

  it('lets the Paper NodeSpec own its metadata subtitle behavior', () => {
    const paper = makeEntry({
      isA: 'Paper',
      path: '/vault/paper.md',
      properties: { authors: ['Ada Lovelace'], venue_short: 'CanvasConf', year: 2026 },
      title: 'Paper',
    })
    const paperCard = renderCard({ ...baseNode, type: 'paper' }, { entry: paper })
    expect(screen.getByText('Lovelace / 2026 / CanvasConf')).toBeInTheDocument()
    paperCard.unmount()

    renderCard({ ...baseNode, type: 'note' }, { entry: paper })
    expect(screen.queryByText('Lovelace / 2026 / CanvasConf')).not.toBeInTheDocument()
  })
})

describe('NodeSpec inspector behavior', () => {
  function renderInspector(node: ProjectCanvasNode) {
    return render(
      <ProjectCanvasInspector
        canvas={defaultProjectCanvas('project.md')}
        edge={null}
        locale="en"
        node={node}
        spec={specs.getForNode(node)}
        onClose={vi.fn()}
        onDeleteEdge={vi.fn()}
        onDeleteNode={vi.fn()}
        onEdgeChange={vi.fn()}
        onEdgeKindDefaultChange={vi.fn()}
        onNodeChange={vi.fn()}
      />,
    )
  }

  it('uses NodeSpec reference capabilities instead of renderer type checks', () => {
    const image = renderInspector({ ...baseNode, ref: 'assets/figure.png', type: 'image' })
    expect(screen.getByDisplayValue('assets/figure.png')).not.toHaveAttribute('readonly')
    image.unmount()

    renderInspector({ ...baseNode, ref: 'notes/source.md', type: 'note' })
    expect(screen.getByDisplayValue('notes/source.md')).toHaveAttribute('readonly')
  })

  it('renders Inspector actions from the selected NodeSpec', () => {
    const textSpec = { ...specs.get('text'), inspectorActions: [] }
    render(
      <ProjectCanvasInspector
        canvas={defaultProjectCanvas('project.md')}
        edge={null}
        locale="en"
        node={baseNode}
        spec={textSpec}
        onClose={vi.fn()}
        onDeleteEdge={vi.fn()}
        onDeleteNode={vi.fn()}
        onEdgeChange={vi.fn()}
        onEdgeKindDefaultChange={vi.fn()}
        onNavigate={vi.fn()}
        onNodeChange={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete node' })).not.toBeInTheDocument()
  })

  it('edits straight, orthogonal, and curved connector routing through shadcn Select', () => {
    const onEdgeChange = vi.fn()
    render(
      <ProjectCanvasInspector
        canvas={defaultProjectCanvas('project.md')}
        edge={{ id: 'edge-1', from: 'a', to: 'b', kind: 'related', routing: 'straight' }}
        locale="en"
        node={null}
        spec={null}
        onClose={vi.fn()}
        onDeleteEdge={vi.fn()}
        onDeleteNode={vi.fn()}
        onEdgeChange={onEdgeChange}
        onEdgeKindDefaultChange={vi.fn()}
        onNodeChange={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('combobox')).toHaveLength(6)
    fireEvent.click(screen.getByLabelText('Connector routing'))
    expect(screen.getByRole('option', { name: 'Straight' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Orthogonal' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'Curved' }))
    expect(onEdgeChange).toHaveBeenCalledWith({ routing: 'curved' }, true)
  })

  it('edits connector labels, line style, width, and endpoint markers', () => {
    const onEdgeChange = vi.fn()
    render(
      <ProjectCanvasInspector
        canvas={defaultProjectCanvas('project.md')}
        edge={{ id: 'edge-1', from: 'a', to: 'b', kind: 'related' }}
        locale="en"
        node={null}
        spec={null}
        onClose={vi.fn()}
        onDeleteEdge={vi.fn()}
        onDeleteNode={vi.fn()}
        onEdgeChange={onEdgeChange}
        onEdgeKindDefaultChange={vi.fn()}
        onNodeChange={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Connector label'), { target: { value: 'Supports claim' } })
    fireEvent.blur(screen.getByLabelText('Connector label'), { target: { value: 'Supports claim' } })
    fireEvent.click(screen.getByLabelText('Connector line style'))
    fireEvent.click(screen.getByRole('option', { name: 'Dashed' }))
    fireEvent.click(screen.getByLabelText('Connector end marker'))
    fireEvent.click(screen.getByRole('option', { name: 'Arrow' }))

    expect(onEdgeChange).toHaveBeenCalledWith({ label: 'Supports claim' })
    expect(onEdgeChange).toHaveBeenCalledWith({ label: 'Supports claim' }, true)
    expect(onEdgeChange).toHaveBeenCalledWith({ strokeStyle: 'dashed' }, true)
    expect(onEdgeChange).toHaveBeenCalledWith({ toMarker: 'arrow' }, true)
  })
})
