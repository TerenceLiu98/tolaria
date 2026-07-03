import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VaultEntry } from '../types'
import { MOCK_CONTENT } from '../mock-tauri/mock-content'
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
  trackPaperMarginaliaCitationAdded: vi.fn(),
  trackPaperMarginaliaOpened: vi.fn(),
  trackPaperBlockCitationCopied: vi.fn(),
  trackPaperReaderModeChanged: vi.fn(),
  trackPaperReaderOpened: vi.fn(),
}))

const mockedLoadPaperBlocks = vi.mocked(loadPaperBlocks)
const mockedParsePaper = vi.mocked(parsePaper)
const annotationsPath = '/vault/papers/attention/annotations.jsonl'
const marginaliaPath = '/vault/papers/attention/notes/marginalia.md'

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
].join('\n')

const blocks: SourceBlock[] = [
  {
    id: 'b0001',
    paper_id: 'attention',
    kind: 'title',
    page: 1,
    hash: 'sha256:title',
    text: 'Attention Is All You Need',
  },
  {
    id: 'b0002',
    paper_id: 'attention',
    kind: 'paragraph',
    page: 2,
    hash: 'sha256:paragraph',
    text: 'The Transformer allows for significantly more parallelization.',
  },
]

const parsedBlocks: SourceBlock[] = [
  ...blocks,
  {
    id: 'b0003',
    paper_id: 'attention',
    kind: 'heading',
    page: 2,
    hash: 'sha256:method',
    section: 'Method',
    text: 'Model Architecture',
  },
  {
    id: 'b0004',
    paper_id: 'attention',
    kind: 'figure',
    page: 3,
    hash: 'sha256:figure',
    caption: 'Figure 1: Transformer model overview.',
  },
  {
    id: 'b0005',
    paper_id: 'attention',
    kind: 'table',
    page: 4,
    hash: 'sha256:table',
    section: 'Experiments',
    text: 'BLEU scores by model size',
  },
  {
    id: 'b0006',
    paper_id: 'attention',
    kind: 'equation',
    page: 5,
    hash: 'sha256:equation',
    text: 'Attention(Q, K, V) = softmax(QK^T / sqrt(d_k))V',
  },
  {
    id: 'b0007',
    paper_id: 'attention',
    kind: 'caption',
    page: 5,
    hash: 'sha256:caption',
    text: 'Table 1: Training costs.',
  },
]

function paperEntry(): VaultEntry {
  return {
    path: '/vault/papers/attention/paper.md',
    filename: 'paper.md',
    title: 'Attention Is All You Need',
    isA: 'Paper',
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    archived: false,
    modifiedAt: null,
    createdAt: null,
    fileSize: 0,
    snippet: '',
    wordCount: 0,
    relationships: {},
    icon: null,
    color: null,
    order: null,
    sidebarLabel: null,
    template: null,
    sort: null,
    view: null,
    visible: true,
    organized: false,
    favorite: false,
    favoriteIndex: null,
    listPropertiesDisplay: [],
    outgoingLinks: [],
    properties: { paper_id: 'attention' },
    hasH1: false,
    fileKind: 'markdown',
  }
}

function readyBlocks() {
  mockedLoadPaperBlocks.mockResolvedValueOnce({
    paperId: 'attention',
    path: '/vault/papers/attention/blocks.jsonl',
    state: 'ready',
    blocks,
  })
}

describe('PaperReaderShell', () => {
  beforeEach(() => {
    clearPendingBlockFocus()
    Reflect.deleteProperty(MOCK_CONTENT, annotationsPath)
    Reflect.deleteProperty(MOCK_CONTENT, marginaliaPath)
    mockedLoadPaperBlocks.mockReset()
    mockedParsePaper.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('renders paper metadata, source PDF status, and SourceBlocks', async () => {
    readyBlocks()

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(screen.getByTestId('paper-reader-shell')).toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-paper-id')).toHaveTextContent('attention')
    expect(screen.getByText('PDF: ready')).toBeInTheDocument()
    expect(await screen.findByText('Structure: parsed')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Paper outline' })).toBeInTheDocument()
    expect(await screen.findByTestId('paper-reader-block-b0001')).toHaveTextContent('Attention Is All You Need')
    expect(screen.getByTestId('paper-reader-block-b0002')).toHaveTextContent('parallelization')
    expect(screen.getAllByText('2 source blocks')).not.toHaveLength(0)
    expect(screen.getByTestId('paper-reader-source-preview')).toHaveAttribute('data-path', '/vault/papers/attention/source.pdf')
    expect(screen.getAllByRole('heading', { name: 'source.pdf' })).toHaveLength(1)
  })

  it('selects and focuses a requested block from citation navigation state', async () => {
    readyBlocks()
    setPendingBlockFocus({ paperId: 'attention', blockId: 'b0002' })

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    const block = await screen.findByTestId('paper-reader-block-b0002')
    await waitFor(() => {
      expect(screen.getByTestId('paper-reader-selected-block')).toHaveTextContent('b0002')
      expect(within(block).getByRole('button', { name: /parallelization/u })).toHaveAttribute('aria-current', 'true')
    })
  })

  it('lets the user select a block from the outline', async () => {
    readyBlocks()

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    const block = await screen.findByTestId('paper-reader-block-b0002')
    fireEvent.click(within(block).getByRole('button', { name: /parallelization/u }))

    expect(screen.getByTestId('paper-reader-selected-block')).toHaveTextContent('b0002')
    expect(within(block).getByRole('button', { name: /parallelization/u })).toHaveAttribute('aria-current', 'true')
  })

  it('copies canonical block citations from the block outline', async () => {
    readyBlocks()

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    await screen.findByTestId('paper-reader-block-b0001')
    fireEvent.click(screen.getByLabelText('@block[attention#b0001]'))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('@block[attention#b0001]')
    })
  })

  it('renders parsed SourceBlock kinds as a readable paper view', async () => {
    mockedLoadPaperBlocks.mockResolvedValueOnce({
      paperId: 'attention',
      path: '/vault/papers/attention/blocks.jsonl',
      state: 'ready',
      blocks: parsedBlocks,
    })

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(await screen.findByRole('heading', { name: 'Attention Is All You Need' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Model Architecture' })).toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-block-b0004')).toHaveTextContent('figure')
    expect(screen.getByTestId('paper-reader-block-b0004')).toHaveTextContent('Transformer model overview')
    expect(screen.getByTestId('paper-reader-block-b0005')).toHaveTextContent('table')
    expect(screen.getByTestId('paper-reader-block-b0006')).toHaveTextContent('Attention(Q, K, V)')
    expect(screen.getByTestId('paper-reader-block-b0007')).toHaveTextContent('Table 1: Training costs.')
  })

  it('navigates from outline items and records PDF page focus intent', async () => {
    mockedLoadPaperBlocks.mockResolvedValueOnce({
      paperId: 'attention',
      path: '/vault/papers/attention/blocks.jsonl',
      state: 'ready',
      blocks: parsedBlocks,
    })

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    const outline = await screen.findByTestId('paper-reader-outline-items')
    fireEvent.click(within(outline).getByRole('button', { name: /Model Architecture/u }))

    expect(screen.getByTestId('paper-reader-selected-block')).toHaveTextContent('b0003')
    expect(screen.getByTestId('paper-reader-pdf-focus-request')).toHaveTextContent('b0003')
    expect(screen.getByTestId('paper-reader-pdf-focus-request')).toHaveTextContent('p.2')
  })

  it('searches parsed text and focuses a selected search result', async () => {
    mockedLoadPaperBlocks.mockResolvedValueOnce({
      paperId: 'attention',
      path: '/vault/papers/attention/blocks.jsonl',
      state: 'ready',
      blocks: parsedBlocks,
    })

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    fireEvent.change(await screen.findByLabelText('Search paper blocks'), {
      target: { value: 'overview' },
    })
    const results = await screen.findByTestId('paper-reader-search-results')
    fireEvent.click(within(results).getByRole('button', { name: /Transformer model overview/u }))

    expect(screen.getByTestId('paper-reader-selected-block')).toHaveTextContent('b0004')
    expect(screen.getByTestId('paper-reader-pdf-focus-request')).toHaveTextContent('p.3')
  })

  it('creates and opens the default marginalia note from the reader action', async () => {
    readyBlocks()
    const onOpenPaperNote = vi.fn()

    render(
      <PaperReaderShell
        entry={paperEntry()}
        content={paperContent}
        vaultPath="/vault"
        onOpenPaperNote={onOpenPaperNote}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create/Open Marginalia Note' }))

    await waitFor(() => {
      expect(MOCK_CONTENT[marginaliaPath]).toContain('type: ResearchNote')
      expect(onOpenPaperNote).toHaveBeenCalledWith(marginaliaPath)
    })
    expect(MOCK_CONTENT[marginaliaPath]).toContain('paper:\n  - "[[papers/attention/paper]]"')
  })

  it('opens existing marginalia instead of overwriting it', async () => {
    readyBlocks()
    MOCK_CONTENT[marginaliaPath] = '# Existing marginalia\n'
    const onOpenPaperNote = vi.fn()

    render(
      <PaperReaderShell
        entry={paperEntry()}
        content={paperContent}
        vaultPath="/vault"
        onOpenPaperNote={onOpenPaperNote}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create/Open Marginalia Note' }))

    await waitFor(() => {
      expect(onOpenPaperNote).toHaveBeenCalledWith(marginaliaPath)
    })
    expect(MOCK_CONTENT[marginaliaPath]).toBe('# Existing marginalia\n')
  })

  it('appends the selected block citation to marginalia', async () => {
    readyBlocks()
    MOCK_CONTENT[marginaliaPath] = '# Existing marginalia\n'
    const onOpenPaperNote = vi.fn()

    render(
      <PaperReaderShell
        entry={paperEntry()}
        content={paperContent}
        vaultPath="/vault"
        onOpenPaperNote={onOpenPaperNote}
      />,
    )

    const block = await screen.findByTestId('paper-reader-block-b0002')
    fireEvent.click(within(block).getByRole('button', { name: /parallelization/u }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Selected Block to Marginalia' }))

    await waitFor(() => {
      expect(MOCK_CONTENT[marginaliaPath]).toBe('# Existing marginalia\n\n- @block[attention#b0002]\n')
      expect(onOpenPaperNote).toHaveBeenCalledWith(marginaliaPath)
    })
  })

  it('switches between read mode and marginalia split mode', async () => {
    readyBlocks()

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(screen.getByRole('tab', { name: 'Read' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('paper-reader-source-preview')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Marginalia' }))

    expect(screen.getByRole('tab', { name: 'Marginalia' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByTestId('paper-reader-marginalia-pane')).toBeInTheDocument()
    expect(screen.queryByTestId('paper-reader-source-preview')).not.toBeInTheDocument()
  })

  it('shows a missing marginalia state in marginalia mode without creating the note', async () => {
    readyBlocks()

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    fireEvent.click(screen.getByRole('tab', { name: 'Marginalia' }))

    const pane = await screen.findByTestId('paper-reader-marginalia-pane')
    expect(within(pane).getByText('marginalia.md missing')).toBeInTheDocument()
    expect(within(pane).getByText(marginaliaPath)).toBeInTheDocument()
    expect(Object.hasOwn(MOCK_CONTENT, marginaliaPath)).toBe(false)
  })

  it('previews existing marginalia content in marginalia mode', async () => {
    readyBlocks()
    MOCK_CONTENT[marginaliaPath] = '# Existing marginalia\n\nA durable note.'

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    fireEvent.click(screen.getByRole('tab', { name: 'Marginalia' }))

    const pane = await screen.findByTestId('paper-reader-marginalia-pane')
    expect(within(pane).getByText('marginalia.md ready')).toBeInTheDocument()
    expect(await within(pane).findByTestId('paper-reader-marginalia-preview')).toHaveTextContent('A durable note.')
  })

  it('refreshes the marginalia preview after appending the selected block citation in split mode', async () => {
    readyBlocks()
    MOCK_CONTENT[marginaliaPath] = '# Existing marginalia\n'

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    const block = await screen.findByTestId('paper-reader-block-b0002')
    fireEvent.click(within(block).getByRole('button', { name: /parallelization/u }))
    fireEvent.click(screen.getByRole('tab', { name: 'Marginalia' }))
    const pane = await screen.findByTestId('paper-reader-marginalia-pane')
    fireEvent.click(within(pane).getByRole('button', { name: 'Add Selected Block to Marginalia' }))

    await waitFor(() => {
      expect(within(pane).getByTestId('paper-reader-marginalia-preview')).toHaveTextContent('@block[attention#b0002]')
    })
    expect(MOCK_CONTENT[marginaliaPath]).toBe('# Existing marginalia\n\n- @block[attention#b0002]\n')
  })

  it('keeps the selected block when switching reader modes', async () => {
    readyBlocks()

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    const block = await screen.findByTestId('paper-reader-block-b0002')
    fireEvent.click(within(block).getByRole('button', { name: /parallelization/u }))
    fireEvent.click(screen.getByRole('tab', { name: 'Marginalia' }))

    expect(await screen.findByTestId('paper-reader-current-block')).toHaveTextContent('b0002')
    fireEvent.click(screen.getByRole('tab', { name: 'Read' }))

    await waitFor(() => {
      expect(screen.getByTestId('paper-reader-selected-block')).toHaveTextContent('b0002')
    })
  })

  it('uses a responsive stacked-to-split marginalia layout', async () => {
    readyBlocks()

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    fireEvent.click(screen.getByRole('tab', { name: 'Marginalia' }))

    expect(await screen.findByTestId('paper-reader-marginalia-layout')).toHaveClass('grid-cols-1')
    expect(screen.getByTestId('paper-reader-marginalia-layout').className).toContain('xl:grid-cols-')
  })

  it('collapses and expands the paper outline', async () => {
    readyBlocks()

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(await screen.findByTestId('paper-reader-block-b0001')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse paper outline' }))

    expect(screen.queryByTestId('paper-reader-outline-items')).not.toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-block-b0001')).toBeInTheDocument()
    expect(screen.getByText('Outline')).toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-read-layout').className).toContain('lg:grid-cols-[3rem_')

    fireEvent.click(screen.getByRole('button', { name: 'Expand paper outline' }))

    expect(await screen.findByTestId('paper-reader-block-b0001')).toBeInTheDocument()
  })

  it('keeps the read split layout stretched to the reader viewport', async () => {
    readyBlocks()

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    const readLayout = await screen.findByTestId('paper-reader-read-layout')
    expect(readLayout.parentElement).toHaveClass('flex', 'flex-col')
    expect(readLayout).toHaveClass('h-full', 'flex-1')
    expect(readLayout.className).toContain('lg:grid-cols-[18rem_')
  })

  it('renders recoverable missing and empty paper structure states', async () => {
    mockedLoadPaperBlocks.mockResolvedValueOnce({
      paperId: 'attention',
      path: '/vault/papers/attention/blocks.jsonl',
      state: 'missing',
      blocks: [],
    })
    const { unmount } = render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(await screen.findByText('Paper is not parsed yet')).toBeInTheDocument()
    unmount()

    mockedLoadPaperBlocks.mockResolvedValueOnce({
      paperId: 'attention',
      path: '/vault/papers/attention/blocks.jsonl',
      state: 'empty',
      blocks: [],
    })
    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(await screen.findByText('No readable blocks found')).toBeInTheDocument()
  })

  it('shows recoverable health warnings for minimally normalized parsed blocks', async () => {
    mockedLoadPaperBlocks.mockResolvedValueOnce({
      paperId: 'attention',
      path: '/vault/papers/attention/blocks.jsonl',
      state: 'ready',
      blocks: [
        {
          id: 'b0001',
          paper_id: 'attention',
          kind: 'figure',
          page: 0,
          hash: 'sha256:minimal',
        },
      ],
    })

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(await screen.findByText('Some blocks are missing page numbers')).toBeInTheDocument()
    expect(screen.getByText('Some blocks only have minimal metadata')).toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-block-b0001')).toHaveTextContent('page missing')
  })

  it('shows a Parse Paper action when paper structure is missing', async () => {
    mockedLoadPaperBlocks
      .mockResolvedValueOnce({
        paperId: 'attention',
        path: '/vault/papers/attention/blocks.jsonl',
        state: 'missing',
        blocks: [],
      })
      .mockResolvedValueOnce({
        paperId: 'attention',
        path: '/vault/papers/attention/blocks.jsonl',
        state: 'ready',
        blocks,
      })
    const onParsePaper = vi.fn().mockResolvedValue(undefined)

    render(
      <PaperReaderShell
        entry={paperEntry()}
        content={paperContent}
        vaultPath="/vault"
        onParsePaper={onParsePaper}
      />,
    )

    expect(await screen.findByText('Paper is not parsed yet')).toBeInTheDocument()
    expect(screen.getByText('Parse this PDF to create the reading outline and block citations.')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Parse Paper' })[0])

    await waitFor(() => expect(onParsePaper).toHaveBeenCalledWith('attention'))
    await waitFor(() => expect(mockedLoadPaperBlocks).toHaveBeenCalledTimes(2))
    expect(await screen.findByTestId('paper-reader-block-b0001')).toBeInTheDocument()
  })

  it('labels the missing-block parse action for MinerU provider', async () => {
    mockedLoadPaperBlocks.mockResolvedValueOnce({
      paperId: 'attention',
      path: '/vault/papers/attention/blocks.jsonl',
      state: 'missing',
      blocks: [],
    })

    render(
      <PaperReaderShell
        entry={paperEntry()}
        content={paperContent}
        vaultPath="/vault"
        onParsePaper={vi.fn()}
        paperParserProvider="mineru"
      />,
    )

    expect(await screen.findAllByRole('button', { name: 'Parse with MinerU' })).not.toHaveLength(0)
  })

  it('keeps the header parse action visible for already parsed papers', async () => {
    readyBlocks()

    render(
      <PaperReaderShell
        entry={paperEntry()}
        content={paperContent}
        vaultPath="/vault"
        onParsePaper={vi.fn()}
        paperParserProvider="mineru"
      />,
    )

    expect(await screen.findByRole('button', { name: 'Parse with MinerU' })).toBeInTheDocument()
  })

  it('shows and runs the parse action from the reader when no app handler is provided', async () => {
    mockedLoadPaperBlocks
      .mockResolvedValueOnce({
        paperId: 'attention',
        path: '/vault/papers/attention/blocks.jsonl',
        state: 'missing',
        blocks: [],
      })
      .mockResolvedValueOnce({
        paperId: 'attention',
        path: '/vault/papers/attention/blocks.jsonl',
        state: 'ready',
        blocks,
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

    render(
      <PaperReaderShell
        entry={paperEntry()}
        content={paperContent}
        vaultPath="/vault"
        paperParserProvider="mineru"
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Parse with MinerU' }))

    await waitFor(() => expect(mockedParsePaper).toHaveBeenCalledWith('/vault', 'attention'))
    expect(await screen.findByTestId('paper-reader-block-b0001')).toBeInTheDocument()
  })

  it('shows a header parse action when an unparsed paper has an empty blocks sidecar', async () => {
    mockedLoadPaperBlocks
      .mockResolvedValueOnce({
        paperId: 'attention',
        path: '/vault/papers/attention/blocks.jsonl',
        state: 'empty',
        blocks: [],
      })
      .mockResolvedValueOnce({
        paperId: 'attention',
        path: '/vault/papers/attention/blocks.jsonl',
        state: 'ready',
        blocks,
      })
    const onParsePaper = vi.fn().mockResolvedValue(undefined)

    render(
      <PaperReaderShell
        entry={paperEntry()}
        content={paperContent.replace('parse_status: parsed', 'parse_status: unparsed')}
        vaultPath="/vault"
        onParsePaper={onParsePaper}
        paperParserProvider="mineru"
      />,
    )

    expect(await screen.findByText('No readable blocks found')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Parse with MinerU' }))
    await waitFor(() => expect(onParsePaper).toHaveBeenCalledWith('attention'))
  })

  it('shows a retry action when the last parse failed while preserving old blocks', async () => {
    mockedLoadPaperBlocks.mockResolvedValue({
      paperId: 'attention',
      path: '/vault/papers/attention/blocks.jsonl',
      state: 'ready',
      blocks,
    })
    const onParsePaper = vi.fn().mockResolvedValue(undefined)

    render(
      <PaperReaderShell
        entry={paperEntry()}
        content={paperContent.replace(
          'parse_status: parsed',
          'parse_status: failed\nparse_error: MinerU returned 401 unauthorized',
        )}
        vaultPath="/vault"
        onParsePaper={onParsePaper}
        paperParserProvider="mineru"
      />,
    )

    expect(await screen.findByTestId('paper-reader-parse-failed')).toHaveTextContent('Last parse failed')
    expect(screen.getByTestId('paper-reader-parse-failed')).toHaveTextContent('MinerU authentication failed')
    expect(screen.getByTestId('paper-reader-parse-failed')).toHaveTextContent('MinerU returned 401 unauthorized')
    expect(screen.getByTestId('paper-reader-block-b0001')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Parse with MinerU' })[0])
    await waitFor(() => expect(onParsePaper).toHaveBeenCalledWith('attention'))
  })

  it('renders malformed sidecar errors without hiding the reader shell', async () => {
    mockedLoadPaperBlocks.mockRejectedValueOnce({
      kind: 'malformed_json',
      message: 'blocks.jsonl has malformed JSON',
      paperId: 'attention',
      path: '/vault/papers/attention/blocks.jsonl',
      lineErrors: [{ line: 2, kind: 'malformed_json', message: 'Line is not valid JSON' }],
    })

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(await screen.findByTestId('paper-reader-blocks-error')).toHaveTextContent('blocks.jsonl has malformed JSON')
    expect(screen.getByText('line 2: Line is not valid JSON')).toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-shell')).toBeInTheDocument()
  })

  it('renders malformed annotation sidecar errors without hiding blocks', async () => {
    readyBlocks()
    MOCK_CONTENT[annotationsPath] = '{not json}\n'

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(await screen.findByTestId('paper-reader-annotations-error')).toHaveTextContent('annotations.jsonl contains malformed PaperAnnotation lines')
    expect(screen.getByTestId('paper-reader-block-b0002')).toBeInTheDocument()
  })

  it('creates an empty annotation sidecar from the missing state', async () => {
    readyBlocks()

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(await screen.findByText('No annotations yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enable annotations' }))

    await waitFor(() => {
      expect(MOCK_CONTENT[annotationsPath]).toBe('')
      expect(screen.getByText('No annotations yet')).toBeInTheDocument()
    })
  })

  it('resets a malformed annotation sidecar without hiding blocks', async () => {
    readyBlocks()
    MOCK_CONTENT[annotationsPath] = '{not json}\n'

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(await screen.findByTestId('paper-reader-annotations-error')).toHaveTextContent('annotations.jsonl contains malformed PaperAnnotation lines')
    fireEvent.click(screen.getByRole('button', { name: 'Reset annotations' }))

    await waitFor(() => {
      expect(screen.queryByTestId('paper-reader-annotations-error')).not.toBeInTheDocument()
      expect(MOCK_CONTENT[annotationsPath]).toBe('')
    })
    expect(screen.getByTestId('paper-reader-block-b0002')).toBeInTheDocument()
  })

  it('renders annotation markers on annotated blocks', async () => {
    readyBlocks()
    MOCK_CONTENT[annotationsPath] = [
      JSON.stringify({
        id: 'ann-1',
        paper_id: 'attention',
        block_id: 'b0002',
        kind: 'highlight',
        color: 'important',
        created_at: '2026-07-02T10:15:00Z',
      }),
    ].join('\n') + '\n'

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(await screen.findByTestId('paper-reader-annotation-count-b0002')).toHaveTextContent('1 annotations')
    expect(screen.getByTestId('paper-reader-annotations-b0002')).toHaveTextContent('Highlight')
  })

  it('creates all annotation kinds and semantic colors from the selected block', async () => {
    readyBlocks()

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    const block = await screen.findByTestId('paper-reader-block-b0002')
    fireEvent.click(within(block).getByRole('button', { name: /parallelization/u }))
    const controls = await screen.findByTestId('paper-reader-annotation-controls-b0002')
    fireEvent.click(within(controls).getByRole('combobox', { name: 'Annotation kind' }))
    expect(screen.getByRole('option', { name: 'Highlight' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Underline' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Question' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Comment' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'Bookmark' }))

    fireEvent.click(within(controls).getByRole('combobox', { name: 'Annotation color' }))
    expect(screen.getByRole('option', { name: 'Questioning' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Important' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Original' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Pending' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'Conclusion' }))

    fireEvent.change(within(controls).getByLabelText('Annotation note'), {
      target: { value: 'Remember this block' },
    })
    fireEvent.click(within(controls).getByRole('button', { name: 'Add annotation' }))

    await waitFor(() => {
      expect(screen.getByTestId('paper-reader-annotation-count-b0002')).toHaveTextContent('1 annotations')
    })
    expect(MOCK_CONTENT[annotationsPath]).toContain('"kind":"bookmark"')
    expect(MOCK_CONTENT[annotationsPath]).toContain('"color":"conclusion"')
    expect(MOCK_CONTENT[annotationsPath]).toContain('"note":"Remember this block"')
  })

  it('updates annotation text, kind, and color', async () => {
    readyBlocks()
    MOCK_CONTENT[annotationsPath] = [
      JSON.stringify({
        id: 'ann-1',
        paper_id: 'attention',
        block_id: 'b0002',
        kind: 'comment',
        color: 'pending',
        note: 'Initial note',
        created_at: '2026-07-02T10:15:00Z',
      }),
    ].join('\n') + '\n'

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    const editor = await screen.findByTestId('paper-reader-annotation-editor-ann-1')
    fireEvent.click(within(editor).getByRole('combobox', { name: 'Annotation kind' }))
    fireEvent.click(screen.getByRole('option', { name: 'Underline' }))
    fireEvent.click(within(editor).getByRole('combobox', { name: 'Annotation color' }))
    fireEvent.click(screen.getByRole('option', { name: 'Original' }))
    fireEvent.change(within(editor).getByLabelText('Annotation note'), {
      target: { value: 'Updated interpretation' },
    })
    fireEvent.click(within(editor).getByRole('button', { name: 'Save annotation' }))

    await waitFor(() => {
      expect(MOCK_CONTENT[annotationsPath]).toContain('"kind":"underline"')
      expect(MOCK_CONTENT[annotationsPath]).toContain('"color":"original"')
      expect(MOCK_CONTENT[annotationsPath]).toContain('"note":"Updated interpretation"')
      expect(MOCK_CONTENT[annotationsPath]).toContain('"updated_at"')
    })
  })

  it('deletes annotations from the selected block', async () => {
    readyBlocks()
    MOCK_CONTENT[annotationsPath] = [
      JSON.stringify({
        id: 'ann-1',
        paper_id: 'attention',
        block_id: 'b0002',
        kind: 'highlight',
        color: 'important',
        created_at: '2026-07-02T10:15:00Z',
      }),
    ].join('\n') + '\n'

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    const annotations = await screen.findByTestId('paper-reader-annotations-b0002')
    fireEvent.click(within(annotations).getByRole('button', { name: 'Delete annotation' }))

    await waitFor(() => {
      expect(screen.queryByTestId('paper-reader-annotation-count-b0002')).not.toBeInTheDocument()
    })
    expect(MOCK_CONTENT[annotationsPath]).toBe('')
  })
})
