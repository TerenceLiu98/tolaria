import { beforeEach, describe, expect, it } from 'vitest'
import { MOCK_CONTENT } from '../mock-tauri/mock-content'
import {
  applyPaperMetadataCandidate,
  extractPaperMetadata,
  normalizeMetadataConfidence,
  paperMetadataStatusLabel,
  readPaperMetadata,
  refreshPaperMetadata,
} from './metadata'

const vaultPath = '/vault'
const paperId = 'kan-autoencoders'
const paperPath = `${vaultPath}/papers/${paperId}/paper.md`
const metadataPath = `${vaultPath}/papers/${paperId}/metadata.json`

describe('paper metadata helpers', () => {
  beforeEach(() => {
    Reflect.deleteProperty(MOCK_CONTENT, metadataPath)
    MOCK_CONTENT[paperPath] = [
      '---',
      'type: Paper',
      `paper_id: ${paperId}`,
      'source_pdf: source.pdf',
      '---',
      '# Kolmogorov-Arnold Network Autoencoders',
      'Mohammadamin Moradi, Shirin Panahi and Erik Bollt',
      'Abstract',
      'This paper studies KAN autoencoders. DOI: 10.48550/arXiv.2401.01234',
    ].join('\n')
  })

  it('reads missing sidecars and extracts metadata through mock Tauri commands', async () => {
    await expect(readPaperMetadata(vaultPath, paperId)).resolves.toMatchObject({
      paperId,
      state: 'missing',
      metadata: null,
    })

    const metadata = await extractPaperMetadata(vaultPath, paperId)

    expect(metadata.title).toBe('Kolmogorov-Arnold Network Autoencoders')
    expect(metadata.doi).toBe('10.48550/arxiv.2401.01234')
    expect(metadata.status).toBe('ready')
    expect(MOCK_CONTENT[metadataPath]).toContain('"paperId": "kan-autoencoders"')
    expect(MOCK_CONTENT[paperPath]).toContain('metadata_status: "ready"')
    expect(MOCK_CONTENT[paperPath]).toContain('doi: "10.48550/arxiv.2401.01234"')
  })

  it('applies low-confidence metadata candidates', async () => {
    MOCK_CONTENT[paperPath] = [
      '---',
      'type: Paper',
      `paper_id: ${paperId}`,
      'source_pdf: source.pdf',
      '---',
      '# A Fuzzy Paper Title',
    ].join('\n')

    const metadata = await extractPaperMetadata(vaultPath, paperId)
    expect(metadata.status).toBe('needs_review')
    expect(metadata.candidates).toHaveLength(1)

    const applied = await applyPaperMetadataCandidate(vaultPath, paperId, metadata.candidates[0].id)

    expect(applied.status).toBe('ready')
    expect(applied.candidates).toHaveLength(0)
    expect(MOCK_CONTENT[paperPath]).toContain('metadata_status: "ready"')
  })

  it('refreshes metadata from user-edited paper frontmatter', async () => {
    MOCK_CONTENT[paperPath] = [
      '---',
      'type: Paper',
      `paper_id: ${paperId}`,
      'source_pdf: source.pdf',
      'title: "Corrected KAN Paper"',
      'authors:',
      '  - "Correct Author"',
      'doi: "10.9999/corrected"',
      '---',
      '# Old Parsed Title',
      'Abstract',
      'Body still mentions DOI: 10.1111/stale',
    ].join('\n')

    const metadata = await refreshPaperMetadata(vaultPath, paperId)

    expect(metadata.title).toBe('Corrected KAN Paper')
    expect(metadata.authors).toEqual(['Correct Author'])
    expect(metadata.doi).toBe('10.9999/corrected')
    expect(MOCK_CONTENT[metadataPath]).toContain('"doi": "10.9999/corrected"')
  })

  it('formats status labels and clamps confidence', () => {
    expect(paperMetadataStatusLabel('needs_review')).toBe('needs review')
    expect(paperMetadataStatusLabel(undefined)).toBe('missing')
    expect(normalizeMetadataConfidence(1.5)).toBe(1)
    expect(normalizeMetadataConfidence(-0.5)).toBe(0)
  })
})
