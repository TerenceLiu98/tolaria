import { fireEvent, render, screen } from '@testing-library/react'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import { ProjectEditorSurface } from './ProjectEditorSurface'
import {
  consumeProjectCanvasOpen,
  requestProjectCanvasOpen,
} from './projectCanvasNavigation'

vi.mock('../NoteSurface', () => ({
  NoteSurface: () => <div data-testid="note-surface" />,
}))

vi.mock('./ProjectCanvasSurface', () => ({
  ProjectCanvasSurface: () => <div data-testid="project-canvas-surface" />,
}))

const project = makeEntry({ isA: 'Project', path: '/vault/projects/agents.md', title: 'Agents' })

function renderSurface() {
  return render(
    <ProjectEditorSurface
      currentContent=""
      editor={{} as never}
      editable
      entries={[project]}
      onNavigateWikilink={vi.fn()}
      sourceEntry={project}
      vaultPath="/vault"
    />,
  )
}

describe('ProjectEditorSurface', () => {
  afterEach(() => {
    consumeProjectCanvasOpen(project.path)
  })

  it('opens directly in Canvas mode for a pending add-to-project intent', () => {
    requestProjectCanvasOpen({ projectPath: project.path, nodeId: 'note_1' })

    renderSurface()

    expect(screen.getByTestId('project-canvas-surface')).toBeInTheDocument()
    expect(screen.queryByTestId('note-surface')).not.toBeInTheDocument()
  })

  it('switches an already mounted Project to Canvas mode when an intent arrives', () => {
    renderSurface()
    expect(screen.getByTestId('note-surface')).toBeInTheDocument()

    fireEvent(window, new CustomEvent('sapientia:project-canvas-open', {
      detail: { projectPath: project.path, nodeId: 'paper_1' },
    }))

    expect(screen.getByTestId('project-canvas-surface')).toBeInTheDocument()
  })
})
