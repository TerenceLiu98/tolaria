import type { ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteSurfaceCommentOptions } from '../components/NoteSurface'
import { MOCK_CONTENT } from '../mock-tauri/mock-content'
import type { VaultEntry } from '../types'
import { clearPendingBlockFocus, setPendingBlockFocus } from './blockCitationNavigation'
import { loadPaperBlocks } from './blocks'
import { PaperReaderShell } from './PaperReaderShell'
import { parsePaper } from './parser'
import type { SourceBlock } from './sourceBlocks'

vi.mock('./blocks', () => ({
  loadPaperBlocks: vi.fn(),
}))

vi.mock('./parser', () => ({
  parsePaper: vi.fn(),
}))

vi.mock('../components/NoteSurface', () => ({
  NoteSurface: ({
    className,
    commentOptions,
    editable,
    sourceEntry,
  }: {
    className?: string
    commentOptions?: NoteSurfaceCommentOptions
    editable?: boolean
    sourceEntry?: VaultEntry | null
  }) => (
    <section
      data-testid="note-surface"
      className={className}
      data-readonly={!editable ? 'true' : 'false'}
      data-source-path={sourceEntry?.path}
    >
      {commentOptions ? (
        <aside data-testid="note-surface-comment-seam">
          {commentOptions.anchors.map((anchor) => (
            <button
              key={anchor.id}
              type="button"
              data-testid={`note-surface-anchor-${anchor.id}`}
              onClick={() => commentOptions.onOpenThread(anchor.id)}
            >
              {anchor.title}
              {anchor.comments.length > 0 ? (
                <span data-testid={`comment-gutter-count-${anchor.id}`}>{anchor.comments.length}</span>
              ) : null}
            </button>
          ))}
          {commentOptions.selectedAnchorId ? commentOptions.renderThread(commentOptions.selectedAnchorId) : null}
        </aside>
      ) : null}
    </section>
  ),
}))

vi.mock('../components/FilePreview', () => ({
  FilePreview: ({ entry }: { entry: VaultEntry }) => (
    <section data-testid="paper-reader-source-preview" data-path={entry.path} data-title={entry.title}>
      <h2>{entry.title}</h2>
    </section>
  ),
}))

vi.mock('../lib/productAnalytics', () => ({
  trackPaperAnnotationDeleted: vi.fn(),
  trackPaperAnnotationSidecarReset: vi.fn(),
  trackPaperAnnotationSaved: vi.fn(),
  trackPaperBlockCitationCopied: vi.fn(),
  trackPaperReaderModeChanged: vi.fn(),
  trackPaperReaderOpened: vi.fn(),
}))

const mockedLoadPaperBlocks = vi.mocked(loadPaperBlocks)
const mockedParsePaper = vi.mocked(parsePaper)
const annotationsPath = '/vault/papers/attention/annotations.jsonl'

const paperContent = [
  '---',
  'type: Paper',
  'paper_id: attention',
  'title: Attention Is All You Need',
  'source_pdf: source.pdf',
  'blocks: blocks.jsonl',
  'parse_status: parsed',
  '---',
  '',
  '# Attention Is All You Need',
  '',
  '<!-- tolaria:block id="b0002" page="2" kind="paragraph" hash="sha256:paragraph" -->',
  'This paragraph comes from parsed paper.md.',
].join('\n')

const blocks: SourceBlock[] = [
  {
    hash: 'sha256:title',
    id: 'b0001',
    kind: 'title',
    page: 1,
    paper_id: 'attention',
    text: 'Attention Is All You Need',
  },
  {
    hash: 'sha256:method',
    id: 'b0002',
    kind: 'heading',
    page: 2,
    paper_id: 'attention',
    section: 'Method',
    text: 'Model Architecture',
  },
  {
    hash: 'sha256:paragraph',
    id: 'b0003',
    kind: 'paragraph',
    page: 2,
    paper_id: 'attention',
    text: 'The Transformer allows for significantly more parallelization.',
  },
]

function paperEntry(): VaultEntry {
  return {
    aliases: [],
    archived: false,
    belongsTo: [],
    color: null,
    createdAt: null,
    favorite: false,
    favoriteIndex: null,
    fileKind: 'markdown',
    fileSize: 0,
    filename: 'paper.md',
    hasH1: false,
    icon: null,
    isA: 'Paper',
    listPropertiesDisplay: [],
    modifiedAt: null,
    order: null,
    organized: false,
    outgoingLinks: [],
    path: '/vault/papers/attention/paper.md',
    properties: { paper_id: 'attention' },
    relatedTo: [],
    relationships: {},
    sidebarLabel: null,
    snippet: '',
    sort: null,
    status: null,
    template: null,
    title: 'Attention Is All You Need',
    view: null,
    visible: true,
    wordCount: 0,
  }
}

function readyBlocks(sourceBlocks: SourceBlock[] = blocks) {
  mockedLoadPaperBlocks.mockResolvedValueOnce({
    blocks: sourceBlocks,
    paperId: 'attention',
    path: '/vault/papers/attention/blocks.jsonl',
    state: 'ready',
  })
}

type PaperReaderShellProps = ComponentProps<typeof PaperReaderShell>

function renderPaperReader(overrides: Partial<PaperReaderShellProps> = {}) {
  const entry = overrides.entry ?? paperEntry()
  return render(
    <PaperReaderShell
      content={paperContent}
      editor={{} as PaperReaderShellProps['editor']}
      entries={[entry]}
      entry={entry}
      onNavigateWikilink={vi.fn()}
      vaultPath="/vault"
      {...overrides}
    />,
  )
}

describe('PaperReaderShell', () => {
  beforeEach(() => {
    clearPendingBlockFocus()
    Reflect.deleteProperty(MOCK_CONTENT, annotationsPath)
    mockedLoadPaperBlocks.mockReset()
    mockedParsePaper.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('renders paper metadata and mounts paper.md through a read-only NoteSurface', async () => {
    readyBlocks()

    renderPaperReader()

    expect(screen.getByTestId('paper-reader-shell')).toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-paper-id')).toHaveTextContent('attention')
    expect(screen.getByText('PDF: ready')).toBeInTheDocument()
    expect(await screen.findByText('Structure: parsed')).toBeInTheDocument()
    expect(screen.queryByTestId('paper-reader-outline')).not.toBeInTheDocument()
    expect(screen.getByTestId('note-surface')).toHaveAttribute('data-readonly', 'true')
    expect(screen.getByTestId('note-surface')).toHaveAttribute('data-source-path', '/vault/papers/attention/paper.md')
    expect(screen.getByTestId('note-surface-comment-seam')).toBeInTheDocument()
    expect(screen.queryByTestId('paper-reader-source-preview')).not.toBeInTheDocument()
  })

  it('keeps the Markdown reading surface independently scrollable', async () => {
    readyBlocks()

    renderPaperReader()

    expect(await screen.findByText('Structure: parsed')).toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-shell')).toHaveClass('flex', 'overflow-hidden')
    expect(screen.getByTestId('paper-reader-block-view')).toHaveClass('overflow-hidden')
    expect(screen.getByTestId('paper-reader-read-scroll-area')).toHaveClass('overflow-y-auto')
    expect(screen.getByTestId('note-surface')).toHaveClass('flex-none')
  })

  it('selects and focuses a requested block from citation navigation state', async () => {
    readyBlocks()
    setPendingBlockFocus({ paperId: 'attention', blockId: 'b0002' })

    renderPaperReader()

    await waitFor(() => {
      expect(screen.getByTestId('paper-reader-selected-block')).toHaveTextContent('b0002')
      expect(screen.getByTestId('note-surface-anchor-b0002')).toBeInTheDocument()
      expect(screen.getByTestId('paper-reader-comment-thread-b0002')).toBeInTheDocument()
    })
  })

  it('keeps Markdown and PDF as the only reader modes', async () => {
    readyBlocks()

    renderPaperReader()

    expect(await screen.findByText('Structure: parsed')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Read' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('paper-reader-markdown-layout')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Marginalia' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'PDF' }))

    expect(screen.getByRole('tab', { name: 'PDF' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('paper-reader-source-preview')).toHaveAttribute('data-path', '/vault/papers/attention/source.pdf')
    expect(screen.getAllByRole('heading', { name: 'source.pdf' })).toHaveLength(1)
  })

  it('keeps the reader as a two-mode surface without a Paper outline column', async () => {
    readyBlocks()

    renderPaperReader()

    expect(await screen.findByText('Structure: parsed')).toBeInTheDocument()
    expect(screen.queryByTestId('paper-reader-outline')).not.toBeInTheDocument()
    expect(screen.queryByTestId('paper-reader-outline-items')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Collapse paper outline' })).not.toBeInTheDocument()
    expect(screen.getByTestId('note-surface')).toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-markdown-layout')).toHaveClass('flex')

    fireEvent.click(screen.getByRole('tab', { name: 'PDF' }))
    expect(screen.queryByTestId('paper-reader-outline')).not.toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-pdf-layout')).toHaveClass('flex')
  })

  it('keeps missing paper structure quiet in the reading surface', async () => {
    mockedLoadPaperBlocks.mockResolvedValueOnce({
      blocks: [],
      paperId: 'attention',
      path: '/vault/papers/attention/blocks.jsonl',
      state: 'missing',
    })
    renderPaperReader()

    expect(await screen.findByText('Structure: not parsed')).toBeInTheDocument()
    expect(screen.queryByText('Paper is not parsed yet')).not.toBeInTheDocument()
    expect(screen.queryByText('Parse this PDF to create the reading view and block citations.')).not.toBeInTheDocument()
    expect(screen.queryByTestId('paper-reader-blocks-missing')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Parse Paper' })).toHaveLength(1)
  })

  it('shows recoverable health warnings for minimally normalized parsed blocks', async () => {
    readyBlocks([
      {
        hash: 'sha256:minimal',
        id: 'b0001',
        kind: 'figure',
        page: 0,
        paper_id: 'attention',
      },
    ])

    renderPaperReader()

    expect(await screen.findByText('Some blocks are missing page numbers')).toBeInTheDocument()
    expect(screen.getByText('Some blocks only have minimal metadata')).toBeInTheDocument()
  })

  it('shows and runs the parse action when paper structure is missing', async () => {
    mockedLoadPaperBlocks
      .mockResolvedValueOnce({
        blocks: [],
        paperId: 'attention',
        path: '/vault/papers/attention/blocks.jsonl',
        state: 'missing',
      })
      .mockResolvedValueOnce({
        blocks,
        paperId: 'attention',
        path: '/vault/papers/attention/blocks.jsonl',
        state: 'ready',
      })
    const onParsePaper = vi.fn().mockResolvedValue(undefined)

    renderPaperReader({ onParsePaper })

    expect(await screen.findByText('Structure: not parsed')).toBeInTheDocument()
    expect(screen.queryByText('Paper is not parsed yet')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Parse Paper' }))

    await waitFor(() => expect(onParsePaper).toHaveBeenCalledWith('attention'))
    await waitFor(() => expect(mockedLoadPaperBlocks).toHaveBeenCalledTimes(2))
    expect(await screen.findByTestId('note-surface')).toBeInTheDocument()
  })

  it('labels the parse action for MinerU provider and can use the direct parser fallback', async () => {
    mockedLoadPaperBlocks
      .mockResolvedValueOnce({
        blocks: [],
        paperId: 'attention',
        path: '/vault/papers/attention/blocks.jsonl',
        state: 'missing',
      })
      .mockResolvedValueOnce({
        blocks,
        paperId: 'attention',
        path: '/vault/papers/attention/blocks.jsonl',
        state: 'ready',
      })
    mockedParsePaper.mockResolvedValueOnce({
      assets: [],
      blocks,
      blocksPath: '/vault/papers/attention/blocks.jsonl',
      paperId: 'attention',
      paperPath: '/vault/papers/attention/paper.md',
      parsedAt: '2026-07-02T00:00:00.000Z',
      parser: 'mineru',
      parserVersion: 'mineru-api-v4',
      provider: 'mineru',
      warnings: [],
    })

    renderPaperReader({ paperParserProvider: 'mineru' })

    fireEvent.click(await screen.findByRole('button', { name: 'Parse with MinerU' }))

    await waitFor(() => expect(mockedParsePaper).toHaveBeenCalledWith('/vault', 'attention'))
    expect(await screen.findByTestId('note-surface')).toBeInTheDocument()
  })

  it('renders malformed sidecar errors without hiding the reader shell', async () => {
    mockedLoadPaperBlocks.mockRejectedValueOnce({
      kind: 'malformed_json',
      lineErrors: [{ kind: 'malformed_json', line: 2, message: 'Line is not valid JSON' }],
      message: 'blocks.jsonl has malformed JSON',
      paperId: 'attention',
      path: '/vault/papers/attention/blocks.jsonl',
    })

    renderPaperReader()

    expect(await screen.findByTestId('paper-reader-blocks-error')).toHaveTextContent('blocks.jsonl has malformed JSON')
    expect(screen.getByText('line 2: Line is not valid JSON')).toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-shell')).toBeInTheDocument()
  })

  it('renders malformed annotation sidecar errors without hiding the NoteSurface', async () => {
    readyBlocks()
    MOCK_CONTENT[annotationsPath] = '{not json}\n'

    renderPaperReader()

    expect(await screen.findByTestId('paper-reader-annotations-error')).toHaveTextContent('annotations.jsonl contains malformed PaperAnnotation lines')
    expect(screen.getByTestId('note-surface')).toBeInTheDocument()
  })

  it('hides empty annotation states and resets malformed annotation sidecars', async () => {
    readyBlocks()

    const { unmount } = renderPaperReader()

    expect(await screen.findByTestId('note-surface')).toBeInTheDocument()
    expect(screen.queryByText('No annotations yet')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enable annotations' })).not.toBeInTheDocument()
    unmount()

    readyBlocks()
    MOCK_CONTENT[annotationsPath] = '{not json}\n'
    renderPaperReader()

    expect(await screen.findByTestId('paper-reader-annotations-error')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset annotations' }))

    await waitFor(() => {
      expect(screen.queryByTestId('paper-reader-annotations-error')).not.toBeInTheDocument()
      expect(MOCK_CONTENT[annotationsPath]).toBe('')
    })
  })

  it('shows paper comments through the NoteSurface seam', async () => {
    readyBlocks()
    MOCK_CONTENT[annotationsPath] = `${JSON.stringify({
      block_id: 'b0002',
      color: 'important',
      created_at: '2026-07-02T10:15:00Z',
      id: 'ann-1',
      kind: 'highlight',
      paper_id: 'attention',
    })}\n`

    renderPaperReader()

    expect(await screen.findByTestId('comment-gutter-count-b0002')).toHaveTextContent('1')
    fireEvent.click(screen.getByTestId('note-surface-anchor-b0002'))
    expect(screen.getByTestId('paper-reader-annotations-b0002')).toHaveTextContent('Highlight')
    fireEvent.click(screen.getByTestId('note-surface-anchor-b0002'))
    expect(screen.queryByTestId('paper-reader-comment-thread-b0002')).not.toBeInTheDocument()
  })

  it('creates, updates, deletes, and copies citations from a Paper comment thread without changing paper.md', async () => {
    readyBlocks()
    MOCK_CONTENT[paperEntry().path] = paperContent

    renderPaperReader()

    fireEvent.click(await screen.findByTestId('note-surface-anchor-b0002'))
    const thread = await screen.findByTestId('paper-reader-comment-thread-b0002')
    expect(within(thread).getByText('No comments yet')).toBeInTheDocument()
    fireEvent.click(within(thread).getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('paper-reader-comment-thread-b0002')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('note-surface-anchor-b0002'))
    const reopenedThread = await screen.findByTestId('paper-reader-comment-thread-b0002')
    fireEvent.click(within(reopenedThread).getByRole('button', { name: 'Copy block citation' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('@block[attention#b0002]'))

    const controls = within(reopenedThread).getByTestId('paper-reader-annotation-controls-b0002')
    expect(within(controls).queryByRole('combobox', { name: 'Annotation kind' })).not.toBeInTheDocument()
    expect(within(controls).queryByRole('combobox', { name: 'Annotation color' })).not.toBeInTheDocument()
    expect(within(reopenedThread).queryByText(/b0002|p\.2/u)).not.toBeInTheDocument()
    fireEvent.change(within(controls).getByLabelText('Annotation note'), {
      target: { value: 'This claim needs a citation.' },
    })
    fireEvent.click(within(controls).getByRole('button', { name: 'Comment' }))

    await waitFor(() => {
      expect(MOCK_CONTENT[annotationsPath]).toContain('"kind":"comment"')
      expect(MOCK_CONTENT[annotationsPath]).toContain('"note":"This claim needs a citation."')
      expect(MOCK_CONTENT[paperEntry().path]).toBe(paperContent)
    })

    const editor = await screen.findByTestId(/paper-reader-annotation-editor-/u)
    fireEvent.click(within(editor).getByRole('combobox', { name: 'Annotation kind' }))
    fireEvent.click(screen.getByRole('option', { name: 'Question' }))
    fireEvent.click(within(editor).getByRole('combobox', { name: 'Annotation color' }))
    fireEvent.click(screen.getByRole('option', { name: 'Original' }))
    fireEvent.change(within(editor).getByLabelText('Annotation note'), {
      target: { value: 'Updated interpretation' },
    })
    fireEvent.click(within(editor).getByRole('button', { name: 'Save annotation' }))

    await waitFor(() => {
      expect(MOCK_CONTENT[annotationsPath]).toContain('"kind":"question"')
      expect(MOCK_CONTENT[annotationsPath]).toContain('"color":"original"')
      expect(MOCK_CONTENT[annotationsPath]).toContain('"note":"Updated interpretation"')
      expect(MOCK_CONTENT[paperEntry().path]).toBe(paperContent)
    })

    fireEvent.click(within(await screen.findByTestId('paper-reader-annotations-b0002')).getByRole('button', { name: 'Delete annotation' }))

    await waitFor(() => {
      expect(MOCK_CONTENT[annotationsPath]).toBe('')
      expect(MOCK_CONTENT[paperEntry().path]).toBe(paperContent)
    })
  })
})
