import { describe, expect, it } from 'vitest'
import { makeEntry } from '../test-utils/noteListTestUtils'
import {
  buildPaperCatalog,
  filterPaperCatalog,
  firstAuthorFingerprint,
  normalizeArxivId,
  normalizeDoi,
  sortPaperCatalog,
  titleFingerprint,
  withDuplicateCandidates,
} from './catalog'

describe('Paper catalog', () => {
  it('extracts catalog entries from Paper frontmatter properties', () => {
    const entry = makeEntry({
      path: '/vault/papers/attention/paper.md',
      title: 'Attention Is All You Need',
      isA: 'Paper',
      properties: {
        paper_id: 'attention',
        authors: ['Ashish Vaswani', 'Noam Shazeer'],
        year: 2017,
        venue_short: 'NeurIPS',
        venue_type: 'conference',
        doi: 'https://doi.org/10.5555/3295222.3295349',
        arxiv_id: '1706.03762v5',
        parse_status: 'parsed',
        metadata_status: 'ready',
        metadata_confidence: 0.98,
        source_pdf: 'source.pdf',
      },
    })

    expect(buildPaperCatalog([entry])).toMatchObject([{
      paperId: 'attention',
      path: '/vault/papers/attention/paper.md',
      title: 'Attention Is All You Need',
      authors: ['Ashish Vaswani', 'Noam Shazeer'],
      year: 2017,
      venueShort: 'NeurIPS',
      venueType: 'conference',
      parseStatus: 'parsed',
      metadataStatus: 'ready',
      sourcePdfState: 'present',
    }])
  })

  it('normalizes DOI, arXiv IDs, titles, and first authors for search and dedupe', () => {
    expect(normalizeDoi('https://doi.org/10.1145/ABC.DEF')).toBe('10.1145/abc.def')
    expect(normalizeDoi('doi: 10.1000/XYZ')).toBe('10.1000/xyz')
    expect(normalizeArxivId('https://arxiv.org/pdf/2305.12345v2', { stripVersion: true })).toBe('2305.12345')
    expect(normalizeArxivId('arXiv:cs/9901001v1')).toBe('cs/9901001v1')
    expect(titleFingerprint('Kolmogorov-Arnold Network Autoencoders!')).toBe('kolmogorov arnold network autoencoders')
    expect(firstAuthorFingerprint(['Ashish Vaswani'])).toBe('vaswani')
  })

  it('detects exact duplicate candidates by DOI and arXiv without auto-merging', () => {
    const doiA = makeEntry({
      path: '/vault/papers/a/paper.md',
      title: 'Paper A',
      isA: 'Paper',
      properties: { paper_id: 'a', doi: '10.1000/example' },
    })
    const doiB = makeEntry({
      path: '/vault/papers/b/paper.md',
      title: 'Paper B',
      isA: 'Paper',
      properties: { paper_id: 'b', doi: 'https://doi.org/10.1000/EXAMPLE' },
    })
    const arxivA = makeEntry({
      path: '/vault/papers/c/paper.md',
      title: 'Preprint',
      isA: 'Paper',
      properties: { paper_id: 'c', arxiv_id: '2305.12345v1' },
    })
    const arxivB = makeEntry({
      path: '/vault/papers/d/paper.md',
      title: 'Published',
      isA: 'Paper',
      properties: { paper_id: 'd', arxiv_id: '2305.12345v3' },
    })

    const catalog = buildPaperCatalog([doiA, doiB, arxivA, arxivB])

    expect(catalog.find(entry => entry.paperId === 'a')?.duplicateCandidates[0]).toMatchObject({ paperId: 'b', match: 'doi' })
    expect(catalog.find(entry => entry.paperId === 'c')?.duplicateCandidates[0]).toMatchObject({ paperId: 'd', match: 'arxiv' })
  })

  it('detects fuzzy duplicate candidates by title plus year or first author', () => {
    const first = makeEntry({
      path: '/vault/papers/one/paper.md',
      title: 'KAN Autoencoders',
      isA: 'Paper',
      properties: { paper_id: 'one', title: 'Kolmogorov Arnold Network Autoencoders', year: 2025 },
    })
    const second = makeEntry({
      path: '/vault/papers/two/paper.md',
      title: 'KAN Autoencoders copy',
      isA: 'Paper',
      properties: { paper_id: 'two', title: 'Kolmogorov-Arnold Network Autoencoders', year: 2025 },
    })
    const third = makeEntry({
      path: '/vault/papers/three/paper.md',
      title: 'Same author',
      isA: 'Paper',
      properties: { paper_id: 'three', title: 'A Unified Paper Title', authors: ['Alice Example'] },
    })
    const fourth = makeEntry({
      path: '/vault/papers/four/paper.md',
      title: 'Same author published',
      isA: 'Paper',
      properties: { paper_id: 'four', title: 'A unified paper title', authors: ['Alice Example'] },
    })

    const catalog = buildPaperCatalog([first, second, third, fourth])

    expect(catalog.find(entry => entry.paperId === 'one')?.duplicateCandidates[0]).toMatchObject({ paperId: 'two', match: 'title_year' })
    expect(catalog.find(entry => entry.paperId === 'three')?.duplicateCandidates[0]).toMatchObject({ paperId: 'four', match: 'title_author' })
  })

  it('respects dismissed duplicate decisions', () => {
    const catalog = buildPaperCatalog([
      makeEntry({ path: '/vault/papers/a/paper.md', isA: 'Paper', properties: { paper_id: 'a', doi: '10.1/example' } }),
      makeEntry({ path: '/vault/papers/b/paper.md', isA: 'Paper', properties: { paper_id: 'b', doi: '10.1/example' } }),
    ])
    const decisionId = catalog[0].duplicateCandidates[0].decisionId
    const dismissed = withDuplicateCandidates(catalog, [decisionId])

    expect(dismissed[0].duplicateCandidates).toEqual([])
    expect(dismissed[0].duplicateState).toBe('dismissed')
  })

  it('filters and sorts catalog entries by metadata fields', () => {
    const catalog = buildPaperCatalog([
      makeEntry({
        path: '/vault/papers/a/paper.md',
        title: 'Alpha',
        isA: 'Paper',
        properties: { paper_id: 'a', authors: ['Ada Lovelace'], year: 1843, venue_short: 'Notes', venue_type: 'journal', metadata_status: 'ready', parse_status: 'parsed' },
      }),
      makeEntry({
        path: '/vault/papers/b/paper.md',
        title: 'Beta',
        isA: 'Paper',
        properties: { paper_id: 'b', authors: ['Grace Hopper'], year: 1952, venue_short: 'CACM', venue_type: 'conference', metadata_status: 'needs_review', parse_status: 'failed' },
      }),
    ])

    expect(filterPaperCatalog(catalog, { query: 'hopper', needsReview: true }).map(entry => entry.paperId)).toEqual(['b'])
    expect(filterPaperCatalog(catalog, { venueType: 'journal' }).map(entry => entry.paperId)).toEqual(['a'])
    expect(sortPaperCatalog(catalog, 'year', 'desc').map(entry => entry.paperId)).toEqual(['b', 'a'])
  })
})
