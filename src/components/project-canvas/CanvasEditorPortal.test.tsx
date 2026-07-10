import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import { loadContentForOpen } from '../../hooks/noteContentCache'
import { serializeRichEditorDocumentToMarkdown } from '../../utils/richEditorMarkdown'
import { CanvasEditorPortal } from './CanvasEditorPortal'

const editor = {
  document: [{ id: 'initial' }],
  replaceBlocks: vi.fn(),
  tryParseMarkdownToBlocks: vi.fn(),
}

vi.mock('../useSapientiaBlockNoteEditor', () => ({
  useSapientiaBlockNoteEditor: () => editor,
}))

vi.mock('../../hooks/noteContentCache', () => ({
  cacheNoteContent: vi.fn(),
  getCachedNoteContentEntry: vi.fn(() => null),
  loadContentForOpen: vi.fn(),
}))

vi.mock('../../utils/richEditorMarkdown', () => ({
  serializeRichEditorDocumentToMarkdown: vi.fn(),
}))

vi.mock('../NoteSurface', () => ({
  NoteSurface: ({ onChange, sourceEntry }: { onChange?: () => void; sourceEntry: { path: string } }) => (
    <button type="button" data-testid="canvas-note-surface" onClick={onChange}>
      {sourceEntry.path}
    </button>
  ),
}))

const note = makeEntry({ isA: 'Note', path: '/vault/notes/evidence.md', title: 'Evidence' })

describe('CanvasEditorPortal', () => {
  beforeEach(() => {
    editor.document = [{ id: 'initial' }]
    editor.replaceBlocks.mockReset()
    editor.tryParseMarkdownToBlocks.mockReset()
    vi.mocked(loadContentForOpen).mockReset()
    vi.mocked(serializeRichEditorDocumentToMarkdown).mockReset()
  })

  it('loads one Markdown document into the shared editor and saves through the app boundary', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const parsed = [{ id: 'loaded' }]
    const fullContent = '---\ntype: Note\ntitle: Evidence\n---\n\n# Evidence\n\nOriginal'
    vi.mocked(loadContentForOpen).mockResolvedValue(fullContent)
    editor.tryParseMarkdownToBlocks.mockResolvedValue(parsed)
    vi.mocked(serializeRichEditorDocumentToMarkdown).mockReturnValue(
      '---\ntype: Note\ntitle: Evidence\n---\n\n# Evidence\n\nEdited',
    )
    const onContentChange = vi.fn()

    render(
      <CanvasEditorPortal
        editable
        entries={[note]}
        entry={note}
        onContentChange={onContentChange}
        onNavigateWikilink={vi.fn()}
        target={target}
        vaultPath="/vault"
      />,
    )

    await waitFor(() => expect(screen.getByTestId('canvas-note-surface')).toBeInTheDocument())
    expect(editor.tryParseMarkdownToBlocks).toHaveBeenCalledWith('# Evidence\n\nOriginal')
    expect(editor.replaceBlocks).toHaveBeenCalledWith([{ id: 'initial' }], parsed)

    fireEvent.click(screen.getByTestId('canvas-note-surface'))

    expect(serializeRichEditorDocumentToMarkdown).toHaveBeenCalledWith(expect.objectContaining({
      editor,
      notePath: note.path,
      tabContent: fullContent,
      vaultPath: '/vault',
    }))
    expect(onContentChange).toHaveBeenCalledWith(
      note.path,
      '---\ntype: Note\ntitle: Evidence\n---\n\n# Evidence\n\nEdited',
    )
  })

  it('closes the in-canvas editor on Escape', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    vi.mocked(loadContentForOpen).mockResolvedValue('')
    editor.tryParseMarkdownToBlocks.mockResolvedValue([])
    const onClose = vi.fn()

    render(
      <CanvasEditorPortal
        editable
        entries={[note]}
        entry={note}
        onClose={onClose}
        onNavigateWikilink={vi.fn()}
        target={target}
        vaultPath="/vault"
      />,
    )

    const portal = await screen.findByTestId('canvas-editor-portal')
    fireEvent.keyDown(portal, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
