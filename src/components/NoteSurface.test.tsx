import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NoteSurface } from './NoteSurface'

const singleEditorViewMock = vi.fn()

vi.mock('./SingleEditorView', () => ({
  SingleEditorView: (props: unknown) => {
    singleEditorViewMock(props)
    return <div data-testid="single-editor-view" />
  },
}))

describe('NoteSurface', () => {
  beforeEach(() => {
    singleEditorViewMock.mockClear()
  })

  it('keeps the comment seam compact and renders the selected thread at the selected anchor', () => {
    render(
      <NoteSurface
        commentOptions={{
          anchors: [
            { comments: [], id: 'b0001', title: 'First block' },
            { comments: [{ anchorId: 'b0002', body: 'Existing comment', id: 'c1', kind: 'comment' }], id: 'b0002', title: 'Second block' },
          ],
          onOpenThread: vi.fn(),
          renderThread: (anchorId) => <section data-testid="selected-comment-thread">Thread for {anchorId}</section>,
          selectedAnchorId: 'b0002',
        }}
        editor={{} as never}
        entries={[]}
        onNavigateWikilink={vi.fn()}
      />,
    )

    expect(screen.getByTestId('note-surface')).toHaveClass('grid-cols-[minmax(0,1fr)_3rem]')
    const seam = screen.getByTestId('note-surface-comment-seam')
    const firstAnchor = within(seam).getByTestId('note-surface-comment-anchor-b0001')
    const selectedAnchor = within(seam).getByTestId('note-surface-comment-anchor-b0002')
    expect(firstAnchor).not.toContainElement(screen.getByTestId('selected-comment-thread'))
    expect(selectedAnchor).toContainElement(screen.getByTestId('selected-comment-thread'))
    expect(within(selectedAnchor).getByTestId('comment-gutter-count-b0002')).toHaveTextContent('1')
  })

  it('forwards selected text context changes to the shared editor view', () => {
    const onSelectedTextContextChange = vi.fn()
    render(
      <NoteSurface
        editor={{} as never}
        entries={[]}
        onNavigateWikilink={vi.fn()}
        onSelectedTextContextChange={onSelectedTextContextChange}
      />,
    )

    expect(singleEditorViewMock).toHaveBeenCalledWith(expect.objectContaining({
      onSelectedTextContextChange,
    }))
  })
})
