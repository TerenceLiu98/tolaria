import { render, screen, waitFor } from '@testing-library/react'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import { loadContentForOpen } from '../../hooks/noteContentCache'
import { ProjectDocumentPreview } from './ProjectDocumentPreview'

vi.mock('../../hooks/noteContentCache', () => ({
  getCachedNoteContentEntry: vi.fn(() => null),
  loadContentForOpen: vi.fn(),
}))

const note = makeEntry({
  isA: 'Note',
  path: '/vault/notes/evidence.md',
  snippet: 'Fallback preview',
  title: 'Evidence',
})

describe('ProjectDocumentPreview', () => {
  it('does not load a document for an inactive Canvas node', () => {
    render(<ProjectDocumentPreview active={false} entry={note} onNavigateWikilink={vi.fn()} />)

    expect(loadContentForOpen).not.toHaveBeenCalled()
    expect(screen.queryByTestId('project-document-preview')).not.toBeInTheDocument()
  })

  it('loads the selected document and renders its Markdown body without frontmatter', async () => {
    vi.mocked(loadContentForOpen).mockResolvedValue(
      '---\ntype: Note\ntitle: Evidence\n---\n\n## Finding\n\nA **strong** result.',
    )

    render(<ProjectDocumentPreview active entry={note} onNavigateWikilink={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Finding')).toBeInTheDocument())
    expect(screen.getByText('strong').tagName).toBe('STRONG')
    expect(screen.queryByText('type: Note')).not.toBeInTheDocument()
  })
})
