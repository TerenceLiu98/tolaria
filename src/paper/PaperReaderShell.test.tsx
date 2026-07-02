import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VaultEntry } from '../types'
import { MOCK_CONTENT } from '../mock-tauri/mock-content'
import { clearPendingBlockFocus, setPendingBlockFocus } from './blockCitationNavigation'
import { loadPaperBlocks } from './blocks'
import { PaperReaderShell } from './PaperReaderShell'
import type { SourceBlock } from './sourceBlocks'

vi.mock('./blocks', () => ({
  loadPaperBlocks: vi.fn(),
}))

vi.mock('../components/FilePreview', () => ({
  FilePreview: ({ entry }: { entry: VaultEntry }) => (
    <div data-testid="paper-reader-source-preview" data-path={entry.path} data-title={entry.title} />
  ),
}))

vi.mock('../lib/productAnalytics', () => ({
  trackPaperAnnotationDeleted: vi.fn(),
  trackPaperAnnotationSidecarReset: vi.fn(),
  trackPaperAnnotationSaved: vi.fn(),
  trackPaperBlockCitationCopied: vi.fn(),
  trackPaperReaderOpened: vi.fn(),
}))

const mockedLoadPaperBlocks = vi.mocked(loadPaperBlocks)
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
    mockedLoadPaperBlocks.mockReset()
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
    expect(screen.getByText('source_pdf: configured')).toBeInTheDocument()
    expect(await screen.findByTestId('paper-reader-block-b0001')).toHaveTextContent('Attention Is All You Need')
    expect(screen.getByTestId('paper-reader-block-b0002')).toHaveTextContent('parallelization')
    expect(screen.getByText('2 blocks')).toBeInTheDocument()
    expect(screen.getByTestId('paper-reader-source-preview')).toHaveAttribute('data-path', '/vault/papers/attention/source.pdf')
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

  it('renders recoverable missing and empty sidecar states', async () => {
    mockedLoadPaperBlocks.mockResolvedValueOnce({
      paperId: 'attention',
      path: '/vault/papers/attention/blocks.jsonl',
      state: 'missing',
      blocks: [],
    })
    const { unmount } = render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(await screen.findByText('blocks.jsonl missing')).toBeInTheDocument()
    unmount()

    mockedLoadPaperBlocks.mockResolvedValueOnce({
      paperId: 'attention',
      path: '/vault/papers/attention/blocks.jsonl',
      state: 'empty',
      blocks: [],
    })
    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(await screen.findByText('blocks.jsonl empty')).toBeInTheDocument()
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

    expect(await screen.findByText('annotations.jsonl missing')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create empty sidecar' }))

    await waitFor(() => {
      expect(MOCK_CONTENT[annotationsPath]).toBe('')
      expect(screen.getByText('annotations.jsonl empty')).toBeInTheDocument()
    })
  })

  it('resets a malformed annotation sidecar without hiding blocks', async () => {
    readyBlocks()
    MOCK_CONTENT[annotationsPath] = '{not json}\n'

    render(<PaperReaderShell entry={paperEntry()} content={paperContent} vaultPath="/vault" />)

    expect(await screen.findByTestId('paper-reader-annotations-error')).toHaveTextContent('annotations.jsonl contains malformed PaperAnnotation lines')
    fireEvent.click(screen.getByRole('button', { name: 'Reset annotations sidecar' }))

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
