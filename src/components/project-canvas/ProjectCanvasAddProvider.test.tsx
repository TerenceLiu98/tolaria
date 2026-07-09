import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { defaultProjectCanvas, type ProjectCanvasNode } from '../../projectCanvas'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import {
  PROJECT_CANVAS_OPEN_EVENT,
  type ProjectCanvasOpenIntent,
} from './projectCanvasNavigation'
import {
  ProjectCanvasAddProvider,
} from './ProjectCanvasAddProvider'
import { useProjectCanvasAdd } from './projectCanvasAddContext'

function RequestButton() {
  const requestAdd = useProjectCanvasAdd()
  return (
    <button type="button" onClick={() => requestAdd?.({
      source: 'note_list',
      label: 'Context Note',
      node: { type: 'note', ref: '/vault/notes/context.md', title: 'Context Note' },
    })}>
      Request add
    </button>
  )
}

describe('ProjectCanvasAddProvider', () => {
  it('picks a Project, adds through the shared action, and opens the focused node', async () => {
    const project = makeEntry({ isA: 'Project', path: '/vault/projects/agents.md', title: 'Agent Research' })
    const addNode = vi.fn(async () => ({
      canvas: defaultProjectCanvas('projects/agents.md'),
      createdCanvas: true,
      duplicate: false,
      node: {
        id: 'note_1',
        type: 'note',
        ref: 'notes/context.md',
        x: 0,
        y: 0,
        width: 240,
        height: 110,
      } satisfies ProjectCanvasNode,
    }))
    const onOpenProject = vi.fn()
    const openListener = vi.fn()
    window.addEventListener(PROJECT_CANVAS_OPEN_EVENT, openListener)

    render(
      <ProjectCanvasAddProvider
        entries={[project, makeEntry({ isA: 'Note', title: 'Not a project' })]}
        vaultPath="/vault"
        addNode={addNode}
        onOpenProject={onOpenProject}
      >
        <RequestButton />
      </ProjectCanvasAddProvider>,
    )

    fireEvent.click(screen.getByText('Request add'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Agent Research')).toBeInTheDocument()
    expect(screen.queryByText('Not a project')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Agent Research'))

    await waitFor(() => expect(addNode).toHaveBeenCalledWith({
      vaultPath: '/vault',
      projectPath: project.path,
      node: { type: 'note', ref: '/vault/notes/context.md', title: 'Context Note' },
    }))
    expect(onOpenProject).toHaveBeenCalledWith(project)
    expect((openListener.mock.calls[0][0] as CustomEvent<ProjectCanvasOpenIntent>).detail).toEqual({
      projectPath: project.path,
      nodeId: 'note_1',
    })
    window.removeEventListener(PROJECT_CANVAS_OPEN_EVENT, openListener)
  })

  it('filters the Project picker by title', () => {
    render(
      <ProjectCanvasAddProvider
        entries={[
          makeEntry({ isA: 'Project', path: '/vault/projects/agents.md', title: 'Agent Research' }),
          makeEntry({ isA: 'Project', path: '/vault/projects/vision.md', title: 'Vision Research' }),
        ]}
        vaultPath="/vault"
        addNode={vi.fn()}
        onOpenProject={vi.fn()}
      >
        <RequestButton />
      </ProjectCanvasAddProvider>,
    )

    fireEvent.click(screen.getByText('Request add'))
    fireEvent.change(screen.getByPlaceholderText('Search Projects...'), { target: { value: 'vision' } })

    expect(screen.queryByText('Agent Research')).not.toBeInTheDocument()
    expect(screen.getByText('Vision Research')).toBeInTheDocument()
  })
})
