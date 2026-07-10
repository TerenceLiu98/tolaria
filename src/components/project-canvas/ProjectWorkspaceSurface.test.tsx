import { render, screen } from '@testing-library/react'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import { ProjectWorkspaceSurface } from './ProjectWorkspaceSurface'
import {
  consumeProjectCanvasOpen,
  requestProjectCanvasOpen,
} from './projectCanvasNavigation'

vi.mock('./ProjectCanvasSurface', () => ({
  ProjectCanvasSurface: () => <div data-testid="project-canvas-surface" />,
}))

const project = makeEntry({ isA: 'Project', path: '/vault/projects/agents.md', title: 'Agents' })

function renderSurface() {
  return render(
    <ProjectWorkspaceSurface
      entries={[project]}
      onNavigateWikilink={vi.fn()}
      sourceEntry={project}
      vaultPath="/vault"
    />,
  )
}

describe('ProjectWorkspaceSurface', () => {
  afterEach(() => {
    consumeProjectCanvasOpen(project.path)
  })

  it('opens every Project as one unified Canvas workspace', () => {
    renderSurface()

    expect(screen.getByTestId('project-canvas-surface')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Note' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Canvas' })).not.toBeInTheDocument()
  })

  it('stays on the Canvas when an add-to-project navigation intent arrives', () => {
    renderSurface()

    requestProjectCanvasOpen({ projectPath: project.path, nodeId: 'paper_1' })

    expect(screen.getByTestId('project-canvas-surface')).toBeInTheDocument()
  })
})
