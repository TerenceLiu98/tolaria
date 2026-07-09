import type { ComponentProps } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteSurfaceCommentOptions } from '../components/NoteSurface'
import { MOCK_CONTENT } from '../mock-tauri/mock-content'
import type { VaultEntry } from '../types'
import {
  BLOCK_CITATION_NAVIGATE_EVENT,
  clearPendingBlockFocus,
  setPendingBlockFocus,
} from './blockCitationNavigation'
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
    onCommentSelectedTextContext,
    onChange,
    onSelectedTextContextChange,
    sourceEntry,
  }: {
    className?: string
    commentOptions?: NoteSurfaceCommentOptions
    editable?: boolean
    onCommentSelectedTextContext?: (context: {
      entryPath: string
      entryTitle: string
      kind: 'text'
      text: string
    }) => void
    onChange?: () => void
    onSelectedTextContextChange?: (context: {
      entryPath: string
      entryTitle: string
      kind: 'text'
      text: string
    }) => void
    sourceEntry?: VaultEntry | null
  }) => (
    <section
      data-testid="note-surface"
      className={className}
      data-has-on-change={onChange ? 'true' : 'false'}
      data-readonly={!editable ? 'true' : 'false'}
      data-source-path={sourceEntry?.path}
    >
      {sourceEntry && onSelectedTextContextChange ? (
        <button
          type="button"
          data-testid="mock-select-paper-text"
          onClick={() => onSelectedTextContextChange({
            entryPath: sourceEntry.path,
            entryTitle: sourceEntry.title,
            kind: 'text',
            text: 'Selected evidence quote',
          })}
        >
          Select text
        </button>
      ) : null}
      {sourceEntry && onCommentSelectedTextContext ? (
        <button
          type="button"
          data-testid="mock-comment-selected-paper-text"
          onClick={() => {
            const context = {
              anchorId: 'cursor-block',
              entryPath: sourceEntry.path,
              entryTitle: sourceEntry.title,
              kind: 'text' as const,
              text: 'Text that does not need to match blocks.jsonl exactly',
            }
            onSelectedTextContextChange?.(context)
            onCommentSelectedTextContext(context)
          }}
        >
          Comment selected text
        </button>
      ) : null}
      {commentOptions ? (
        <aside data-testid="mock-editor-comment-margin-layer">
          {commentOptions.anchors.map((anchor) => (
            <button
              key={anchor.id}
              type="button"
              data-paper-source-block-id={anchor.id}
              data-testid={`note-surface-anchor-${anchor.id}`}
              onClick={() => commentOptions.onToggleThread(anchor.id)}
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
  trackPaperCommentDeleted: vi.fn(),
  trackPaperCommentSidecarReset: vi.fn(),
  trackPaperCommentSaved: vi.fn(),
  trackPaperBlockCitationCopied: vi.fn(),
  trackPaperReaderModeChanged: vi.fn(),
  trackPaperReaderOpened: vi.fn(),
}))

const mockedLoadPaperBlocks = vi.mocked(loadPaperBlocks)
const mockedParsePaper = vi.mocked(parsePaper)
const commentsPath = '/vault/papers/attention/comments.jsonl'
const metadataPath = '/vault/papers/attention/metadata.json'

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

const unparsedPaperContent = paperContent.replace('parse_status: parsed', 'parse_status: unparsed')
const failedPaperContent = paperContent.replace('parse_status: parsed', 'parse_status: failed')

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
      onEditorChange={vi.fn()}
      onNavigateWikilink={vi.fn()}
      paperParserProvider="dev-fixture"
      vaultPath="/vault"
      {...overrides}
    />,
  )
}

async function openMetadataDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Paper metadata' }))
  return screen.findByRole('dialog', { name: 'Paper metadata' })
}

describe('PaperReaderShell', () => {
  beforeEach(() => {
    clearPendingBlockFocus()
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    Reflect.deleteProperty(MOCK_CONTENT, commentsPath)
    MOCK_CONTENT[metadataPath] = `${JSON.stringify({
      authors: ['Ashish Vaswani'],
      candidates: [],
      confidence: 0.94,
      errors: [],
      paperId: 'attention',
      sources: [],
      status: 'ready',
      title: 'Attention Is All You Need',
      updatedAt: '2026-07-02T10:00:00.000Z',
      venue: 'NeurIPS',
      venueShort: 'NeurIPS',
      venueType: 'conference',
      year: 2017,
    })}\n`
    mockedLoadPaperBlocks.mockReset()
    mockedParsePaper.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('renders paper metadata and mounts paper.md through an editable NoteSurface', async () => {
    readyBlocks()

    renderPaperReader()

    expect(screen.getByTestId('paper-reader-shell')).toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-paper-id')).toHaveTextContent('attention')
    expect(await screen.findByTestId('note-surface')).toBeInTheDocument()
    expect(screen.queryByText('PDF: ready')).not.toBeInTheDocument()
    expect(screen.queryByText('Structure: parsed')).not.toBeInTheDocument()
    expect(screen.queryByText('448 source blocks')).not.toBeInTheDocument()
    expect(screen.queryByText('Metadata: ready')).not.toBeInTheDocument()
    expect(screen.queryByTestId('paper-reader-outline')).not.toBeInTheDocument()
    expect(screen.getByTestId('note-surface')).toHaveAttribute('data-readonly', 'false')
    expect(screen.getByTestId('note-surface')).toHaveAttribute('data-has-on-change', 'true')
    expect(screen.getByTestId('note-surface')).toHaveAttribute('data-source-path', '/vault/papers/attention/paper.md')
    expect(screen.getByTestId('mock-editor-comment-margin-layer')).toBeInTheDocument()
    expect(screen.queryByTestId('paper-reader-source-preview')).not.toBeInTheDocument()
    expect(screen.queryByTestId('paper-reader-metadata-inspector')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paper metadata' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh Metadata' })).not.toBeInTheDocument()
  })

  it('refreshes missing Paper metadata and shows review candidates', async () => {
    readyBlocks()
    Reflect.deleteProperty(MOCK_CONTENT, metadataPath)

    renderPaperReader({
      editor: {
        document: [
          { id: 'heading-block' },
          { id: 'cursor-block' },
        ],
      } as PaperReaderShellProps['editor'],
    })

    const dialog = await openMetadataDialog()
    expect(await within(dialog).findByText('Metadata needs review')).toBeInTheDocument()
    expect(within(dialog).getByTestId('paper-reader-metadata-candidates')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))

    await waitFor(() => {
      expect(within(dialog).queryByText('Metadata needs review')).not.toBeInTheDocument()
      expect(MOCK_CONTENT[metadataPath]).toContain('"status": "ready"')
    })
  })

  it('marks reviewed metadata as ready when keeping the current values', async () => {
    readyBlocks()
    Reflect.deleteProperty(MOCK_CONTENT, metadataPath)

    renderPaperReader()

    const dialog = await openMetadataDialog()
    expect(await within(dialog).findByText('Metadata needs review')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep Current' }))

    await waitFor(() => {
      expect(within(dialog).queryByText('Metadata needs review')).not.toBeInTheDocument()
      expect(MOCK_CONTENT[metadataPath]).toContain('"status": "ready"')
      expect(MOCK_CONTENT[metadataPath]).toContain('"candidates": []')
    })
  })

  it('edits Paper metadata from the review inspector and syncs paper frontmatter', async () => {
    readyBlocks()
    Reflect.deleteProperty(MOCK_CONTENT, metadataPath)
    MOCK_CONTENT[paperEntry().path] = paperContent

    renderPaperReader()

    const dialog = await openMetadataDialog()
    expect(await within(dialog).findByText('Metadata needs review')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Corrected Transformer Paper' } })
    fireEvent.change(within(dialog).getByLabelText('Venue'), { target: { value: 'NeurIPS' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(within(dialog).queryByText('Metadata needs review')).not.toBeInTheDocument()
      expect(MOCK_CONTENT[metadataPath]).toContain('"title": "Corrected Transformer Paper"')
      expect(MOCK_CONTENT[metadataPath]).toContain('"venue": "NeurIPS"')
      expect(MOCK_CONTENT['/vault/papers/attention/paper.md']).toContain('title: "Corrected Transformer Paper"')
      expect(MOCK_CONTENT['/vault/papers/attention/paper.md']).toContain('metadata_status: "ready"')
    })
  })

  it('keeps the Markdown reading surface independently scrollable', async () => {
    readyBlocks()

    renderPaperReader()

    expect(await screen.findByTestId('note-surface')).toBeInTheDocument()
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
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    })
  })

  it('switches from PDF mode to Reading view when a block citation requests Markdown focus', async () => {
    readyBlocks()

    renderPaperReader()

    await screen.findByTestId('note-surface')
    fireEvent.click(screen.getByRole('tab', { name: 'PDF' }))
    expect(screen.getByRole('tab', { name: 'PDF' })).toHaveAttribute('aria-selected', 'true')

    act(() => {
      window.dispatchEvent(new CustomEvent(BLOCK_CITATION_NAVIGATE_EVENT, {
        detail: { paperId: 'attention', blockId: 'b0002' },
      }))
    })

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Read' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByTestId('paper-reader-selected-block')).toHaveTextContent('b0002')
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    })
  })

  it('keeps Markdown and PDF as the only reader modes', async () => {
    readyBlocks()

    renderPaperReader()

    expect(await screen.findByTestId('note-surface')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Read' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('paper-reader-markdown-layout')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /note/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'PDF' }))

    expect(screen.getByRole('tab', { name: 'PDF' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('paper-reader-source-preview')).toHaveAttribute('data-path', '/vault/papers/attention/source.pdf')
    expect(screen.getAllByRole('heading', { name: 'source.pdf' })).toHaveLength(1)
  })

  it('keeps the reader as a two-mode surface without a Paper outline column', async () => {
    readyBlocks()

    renderPaperReader()

    expect(await screen.findByTestId('note-surface')).toBeInTheDocument()
    expect(screen.queryByTestId('paper-reader-outline')).not.toBeInTheDocument()
    expect(screen.queryByTestId('paper-reader-outline-items')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Collapse paper outline' })).not.toBeInTheDocument()
    expect(screen.getByTestId('note-surface')).toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-markdown-layout')).toHaveClass('flex')

    fireEvent.click(screen.getByRole('tab', { name: 'PDF' }))
    expect(screen.queryByTestId('paper-reader-outline')).not.toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-pdf-layout')).toHaveClass('flex')
  })

  it('runs parser from the Parse Paper button for unparsed paper structure', async () => {
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
      parser: 'dev-fixture',
      parserVersion: 'fixture',
      provider: 'dev-fixture',
      warnings: [],
    })
    renderPaperReader({ content: unparsedPaperContent })

    expect(await screen.findByRole('button', { name: 'Parse Paper' })).toBeInTheDocument()
    expect(mockedParsePaper).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Parse Paper' }))

    await waitFor(() => expect(mockedParsePaper).toHaveBeenCalledWith('/vault', 'attention', undefined, { force: false }))
    expect(screen.queryByText('Paper is not parsed yet')).not.toBeInTheDocument()
    expect(screen.queryByText('Parse this PDF to create the reading view and block citations.')).not.toBeInTheDocument()
    expect(screen.queryByTestId('paper-reader-blocks-missing')).not.toBeInTheDocument()
  })

  it('asks before refreshing existing Paper metadata', async () => {
    readyBlocks()

    renderPaperReader()

    expect(screen.queryByRole('button', { name: 'Refresh Metadata' })).not.toBeInTheDocument()
    const dialog = await openMetadataDialog()
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Refresh Metadata' })).toBeEnabled())
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refresh Metadata' }))

    expect(screen.getByText('Refresh existing metadata?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Refresh existing metadata?')).not.toBeInTheDocument()
  })

  it('extracts metadata before parse can be started from an uploaded Paper', async () => {
    Reflect.deleteProperty(MOCK_CONTENT, metadataPath)
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
    const onParsePaper = vi.fn().mockImplementation(() => {
      expect(MOCK_CONTENT[metadataPath]).toContain('"paperId": "attention"')
      return Promise.resolve()
    })

    renderPaperReader({ content: unparsedPaperContent, onParsePaper })

    await waitFor(() => expect(MOCK_CONTENT[metadataPath]).toContain('"paperId": "attention"'))
    fireEvent.click(screen.getByRole('button', { name: 'Parse Paper' }))

    await waitFor(() => expect(onParsePaper).toHaveBeenCalledWith('attention', { force: false }))
  })

  it('asks before parsing again when a Paper is already marked parsed', async () => {
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

    await waitFor(() => expect(mockedLoadPaperBlocks).toHaveBeenCalledTimes(1))
    expect(mockedParsePaper).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Parse Paper' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('Parse this Paper again?')
    expect(onParsePaper).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Parse again' }))
    await waitFor(() => expect(onParsePaper).toHaveBeenCalledWith('attention', { force: true }))
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

  it('runs the parse action without confirmation for an unparsed Paper', async () => {
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
    const onParsePaper = vi.fn()
      .mockResolvedValueOnce(undefined)

    renderPaperReader({ content: unparsedPaperContent, onParsePaper })

    expect(await screen.findByRole('button', { name: 'Parse Paper' })).toBeInTheDocument()
    expect(screen.queryByText('Paper is not parsed yet')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Parse Paper' }))

    await waitFor(() => expect(onParsePaper).toHaveBeenCalledWith('attention', { force: false }))
    await waitFor(() => expect(mockedLoadPaperBlocks).toHaveBeenCalledTimes(2))
    expect(await screen.findByTestId('note-surface')).toBeInTheDocument()
  })

  it('keeps the Parse Paper button clickable when no parser provider is configured', async () => {
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
    const onParsePaper = vi.fn()

    renderPaperReader({
      content: unparsedPaperContent,
      onParsePaper,
      paperParserProvider: 'none',
    })

    const parseButton = await screen.findByRole('button', { name: 'Parse Paper' })
    expect(parseButton).toBeEnabled()
    fireEvent.click(parseButton)
    await waitFor(() => expect(onParsePaper).toHaveBeenCalledWith('attention', { force: false }))
  })

  it('lets a failed Paper parse be retried from the Parse Paper button', async () => {
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

    renderPaperReader({
      content: failedPaperContent,
      onParsePaper,
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Parse Paper' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(onParsePaper).toHaveBeenCalledWith('attention', { force: false }))
  })

  it('uses the direct parser fallback for MinerU provider from the Parse button', async () => {
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

    renderPaperReader({ content: unparsedPaperContent, paperParserProvider: 'mineru' })

    fireEvent.click(await screen.findByRole('button', { name: 'Parse with MinerU' }))

    await waitFor(() => expect(mockedParsePaper).toHaveBeenCalledWith('/vault', 'attention', undefined, { force: false }))
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

  it('renders malformed comment sidecar errors without hiding the NoteSurface', async () => {
    readyBlocks()
    MOCK_CONTENT[commentsPath] = '{not json}\n'

    renderPaperReader()

    expect(await screen.findByTestId('paper-reader-comments-error')).toHaveTextContent('comments.jsonl contains malformed PaperComment lines')
    expect(screen.getByTestId('note-surface')).toBeInTheDocument()
  })

  it('hides empty comment states and resets malformed comment sidecars', async () => {
    readyBlocks()

    const { unmount } = renderPaperReader()

    expect(await screen.findByTestId('note-surface')).toBeInTheDocument()
    expect(screen.queryByText('No comments yet')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enable comments' })).not.toBeInTheDocument()
    unmount()

    readyBlocks()
    MOCK_CONTENT[commentsPath] = '{not json}\n'
    renderPaperReader()

    expect(await screen.findByTestId('paper-reader-comments-error')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset comments' }))

    await waitFor(() => {
      expect(screen.queryByTestId('paper-reader-comments-error')).not.toBeInTheDocument()
      expect(MOCK_CONTENT[commentsPath]).toBe('')
    })
  })

  it('shows paper comments through the NoteSurface seam', async () => {
    readyBlocks()
    MOCK_CONTENT[commentsPath] = `${JSON.stringify({
      block_id: 'b0002',
      created_at: '2026-07-02T10:15:00Z',
      id: 'ann-1',
      kind: 'comment',
      paper_id: 'attention',
    })}\n`

    renderPaperReader()

    expect(await screen.findByTestId('comment-gutter-count-b0002')).toHaveTextContent('1')
    fireEvent.click(screen.getByTestId('note-surface-anchor-b0002'))
    expect(screen.getByTestId('paper-reader-comments-b0002')).toBeInTheDocument()
    expect(screen.queryByText('Highlight')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('note-surface-anchor-b0002'))
    expect(screen.queryByTestId('paper-reader-comment-thread-b0002')).not.toBeInTheDocument()
  })

  it('filters and sorts Paper comment threads', async () => {
    readyBlocks()
    MOCK_CONTENT[commentsPath] = `${JSON.stringify({
      block_id: 'b0002',
      created_at: '2026-07-02T10:15:00Z',
      id: 'ann-old-resolved',
      kind: 'comment',
      note: 'Old resolved comment',
      paper_id: 'attention',
      resolved_at: '2026-07-02T10:30:00Z',
    })}\n${JSON.stringify({
      block_id: 'b0002',
      created_at: '2026-07-02T11:15:00Z',
      id: 'ann-new-open',
      kind: 'comment',
      note: 'New open comment',
      paper_id: 'attention',
    })}\n`

    renderPaperReader()

    fireEvent.click(await screen.findByTestId('note-surface-anchor-b0002'))
    const thread = await screen.findByTestId('paper-reader-comment-thread-b0002')
    const list = await within(thread).findByTestId('paper-reader-comments-b0002')
    const newestFirstText = list.textContent ?? ''
    expect(newestFirstText.indexOf('New open comment')).toBeLessThan(newestFirstText.indexOf('Old resolved comment'))

    fireEvent.click(within(thread).getByRole('button', { name: 'Newest' }))
    await waitFor(() => {
      const oldestFirstText = list.textContent ?? ''
      expect(oldestFirstText.indexOf('Old resolved comment')).toBeLessThan(oldestFirstText.indexOf('New open comment'))
    })

    fireEvent.click(within(thread).getByRole('button', { name: 'Open' }))
    expect(within(thread).getByText('New open comment')).toBeInTheDocument()
    expect(within(thread).queryByText('Old resolved comment')).not.toBeInTheDocument()

    fireEvent.click(within(thread).getByRole('button', { name: 'Resolved' }))
    expect(within(thread).getByText('Old resolved comment')).toBeInTheDocument()
    expect(within(thread).queryByText('New open comment')).not.toBeInTheDocument()
  })

  it('opens a Paper comment thread from selected text in the formatting toolbar', async () => {
    readyBlocks()
    MOCK_CONTENT[paperEntry().path] = paperContent

    renderPaperReader({
      editor: {
        document: [
          { id: 'heading-block' },
          { id: 'cursor-block' },
        ],
      } as PaperReaderShellProps['editor'],
    })

    fireEvent.click(await screen.findByTestId('mock-comment-selected-paper-text'))

    const thread = await screen.findByTestId('paper-reader-comment-thread-b0002')
    expect(within(thread).getByTestId('paper-reader-comment-selected-quote-b0002')).toHaveTextContent('Text that does not need to match blocks.jsonl exactly')
    expect(MOCK_CONTENT[commentsPath] ?? '').not.toContain('"kind":"comment"')

    const controls = within(thread).getByTestId('paper-reader-comment-controls-b0002')
    fireEvent.change(within(controls).getByLabelText('Comment'), {
      target: { value: 'Toolbar-created note.' },
    })
    fireEvent.click(within(controls).getByRole('button', { name: 'Comment' }))

    await waitFor(() => {
      expect(MOCK_CONTENT[commentsPath]).toContain('"kind":"comment"')
      expect(MOCK_CONTENT[commentsPath]).toContain('"text":"Text that does not need to match blocks.jsonl exactly"')
      expect(MOCK_CONTENT[commentsPath]).toContain('"note":"Toolbar-created note."')
      expect(MOCK_CONTENT[paperEntry().path]).toBe(paperContent)
    })
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

    fireEvent.click(screen.getByTestId('mock-select-paper-text'))
    await waitFor(() => expect(within(reopenedThread).getByTestId('paper-reader-comment-selected-quote-b0002')).toHaveTextContent('Selected evidence quote'))

    const controls = within(reopenedThread).getByTestId('paper-reader-comment-controls-b0002')
    expect(within(controls).queryByRole('combobox', { name: 'Comment kind' })).not.toBeInTheDocument()
    expect(within(controls).queryByRole('combobox', { name: 'Comment color' })).not.toBeInTheDocument()
    expect(within(reopenedThread).queryByText(/b0002|p\.2/u)).not.toBeInTheDocument()
    fireEvent.change(within(controls).getByLabelText('Comment'), {
      target: { value: 'This claim needs a citation.' },
    })
    fireEvent.click(within(controls).getByRole('button', { name: 'Comment' }))

    await waitFor(() => {
      expect(MOCK_CONTENT[commentsPath]).toContain('"kind":"comment"')
      expect(MOCK_CONTENT[commentsPath]).not.toContain('"color"')
      expect(MOCK_CONTENT[commentsPath]).toContain('"text":"Selected evidence quote"')
      expect(MOCK_CONTENT[commentsPath]).toContain('"note":"This claim needs a citation."')
      expect(MOCK_CONTENT[paperEntry().path]).toBe(paperContent)
    })

    const editor = await screen.findByTestId(/paper-reader-comment-editor-/u)
    expect(within(editor).queryByRole('combobox', { name: 'Comment kind' })).not.toBeInTheDocument()
    expect(within(editor).queryByRole('combobox', { name: 'Comment color' })).not.toBeInTheDocument()
    fireEvent.change(within(editor).getByLabelText('Reply'), {
      target: { value: 'Follow-up from a second reading.' },
    })
    fireEvent.click(within(editor).getByRole('button', { name: 'Reply' }))
    await waitFor(() => {
      expect(MOCK_CONTENT[commentsPath]).toContain('"replies"')
      expect(MOCK_CONTENT[commentsPath]).toContain('"note":"Follow-up from a second reading."')
      expect(screen.getByTestId(/paper-reader-comment-reply-count-/u)).toHaveTextContent('Replies (1)')
      expect(screen.getByTestId(/paper-reader-comment-replies-/u)).toHaveTextContent('Follow-up from a second reading.')
      expect(MOCK_CONTENT[paperEntry().path]).toBe(paperContent)
    })
    fireEvent.click(within(await screen.findByTestId(/paper-reader-comment-replies-/u)).getByRole('button', { name: 'Delete reply' }))
    await waitFor(() => {
      expect(MOCK_CONTENT[commentsPath]).toContain('"deleted_at"')
      expect(screen.queryByTestId(/paper-reader-comment-reply-count-/u)).not.toBeInTheDocument()
      expect(screen.queryByTestId(/paper-reader-comment-replies-/u)).not.toBeInTheDocument()
      expect(MOCK_CONTENT[paperEntry().path]).toBe(paperContent)
    })
    fireEvent.click(within(await screen.findByTestId(/paper-reader-comment-editor-/u)).getByRole('button', { name: 'React 👍' }))
    await waitFor(() => {
      expect(MOCK_CONTENT[commentsPath]).toContain('"reactions"')
      expect(MOCK_CONTENT[commentsPath]).toContain('"emoji":"👍"')
      expect(screen.getByTestId(/paper-reader-comment-reaction-/u)).toHaveTextContent('👍 1')
      expect(MOCK_CONTENT[paperEntry().path]).toBe(paperContent)
    })
    fireEvent.click(within(await screen.findByTestId(/paper-reader-comment-editor-/u)).getByRole('button', { name: 'Remove 👍' }))
    await waitFor(() => {
      expect(screen.queryByTestId(/paper-reader-comment-reaction-/u)).not.toBeInTheDocument()
      expect(MOCK_CONTENT[paperEntry().path]).toBe(paperContent)
    })
    fireEvent.click(within(await screen.findByTestId(/paper-reader-comment-editor-/u)).getByRole('button', { name: 'Resolve' }))
    await waitFor(() => {
      expect(MOCK_CONTENT[commentsPath]).toContain('"resolved_at"')
      expect(screen.getByTestId(/paper-reader-comment-resolved-/u)).toBeInTheDocument()
    })
    fireEvent.click(within(await screen.findByTestId(/paper-reader-comment-editor-/u)).getByRole('button', { name: 'Reopen' }))
    await waitFor(() => {
      expect(MOCK_CONTENT[commentsPath]).not.toContain('"resolved_at"')
      expect(screen.queryByTestId(/paper-reader-comment-resolved-/u)).not.toBeInTheDocument()
    })
    fireEvent.change(within(editor).getByLabelText('Comment'), {
      target: { value: 'Updated interpretation' },
    })
    fireEvent.click(within(editor).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(MOCK_CONTENT[commentsPath]).toContain('"kind":"comment"')
      expect(MOCK_CONTENT[commentsPath]).not.toContain('"color"')
      expect(MOCK_CONTENT[commentsPath]).toContain('"note":"Updated interpretation"')
      expect(MOCK_CONTENT[paperEntry().path]).toBe(paperContent)
    })

    fireEvent.click(within(await screen.findByTestId('paper-reader-comments-b0002')).getByRole('button', { name: 'Delete comment' }))

    await waitFor(() => {
      expect(MOCK_CONTENT[commentsPath]).toBe('')
      expect(MOCK_CONTENT[paperEntry().path]).toBe(paperContent)
    })
  })
})
