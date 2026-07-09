import { describe, expect, it } from 'vitest'
import type { VaultEntry } from '../types'
import {
  blockDisplayText,
  resolvePaperSidecarPath,
  shouldOpenPaperReader,
  sourcePdfEntryForPaper,
} from './paperReaderModel'
import type { PaperMetadata } from './types'

function entry(overrides: Partial<VaultEntry> = {}): VaultEntry {
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
    properties: {},
    hasH1: false,
    fileKind: 'markdown',
    ...overrides,
  }
}

const metadata: PaperMetadata = {
  type: 'Paper',
  paperId: 'attention',
  title: 'Attention Is All You Need',
  sourcePdf: 'source.pdf',
  blocks: 'blocks.jsonl',
  comments: 'comments.jsonl',
  status: null,
  parseStatus: 'parsed',
  year: 2017,
}

describe('paperReaderModel', () => {
  it('opens only markdown Paper entries in the reader shell', () => {
    expect(shouldOpenPaperReader(entry())).toBe(true)
    expect(shouldOpenPaperReader(entry({ isA: 'Note' }))).toBe(false)
    expect(shouldOpenPaperReader(entry({ fileKind: 'binary' }))).toBe(false)
    expect(shouldOpenPaperReader(null)).toBe(false)
  })

  it('resolves paper sidecar paths relative to paper.md', () => {
    expect(resolvePaperSidecarPath('/vault/papers/attention/paper.md', 'source.pdf')).toBe('/vault/papers/attention/source.pdf')
    expect(resolvePaperSidecarPath('/vault/papers/attention/paper.md', '/tmp/source.pdf')).toBe('/tmp/source.pdf')
  })

  it('creates a binary source.pdf entry for existing file preview architecture', () => {
    const pdfEntry = sourcePdfEntryForPaper(entry(), metadata)

    expect(pdfEntry.path).toBe('/vault/papers/attention/source.pdf')
    expect(pdfEntry.filename).toBe('source.pdf')
    expect(pdfEntry.fileKind).toBe('binary')
    expect(pdfEntry.title).toBe('source.pdf')
  })

  it('chooses readable block display text without requiring parser-specific fields', () => {
    expect(blockDisplayText({
      id: 'b1',
      paper_id: 'attention',
      kind: 'paragraph',
      page: 2,
      hash: 'sha256:b1',
      text: 'The Transformer allows more parallelization.',
    })).toBe('The Transformer allows more parallelization.')
    expect(blockDisplayText({
      id: 'b2',
      paper_id: 'attention',
      kind: 'figure',
      page: 3,
      hash: 'sha256:b2',
      caption: 'Model architecture',
    })).toBe('Model architecture')
  })
})
