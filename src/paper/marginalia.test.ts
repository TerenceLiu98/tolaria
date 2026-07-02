import { beforeEach, describe, expect, it } from 'vitest'
import { MOCK_CONTENT } from '../mock-tauri/mock-content'
import {
  addBlockCitationToMarginalia,
  appendBlockCitationToMarginalia,
  buildMarginaliaTemplate,
  createOrOpenPaperMarginalia,
  defaultMarginaliaPathForPaper,
  paperWikilinkForPaperPath,
  readPaperMarginalia,
  uniqueMarginaliaPathForPaper,
} from './marginalia'

const paperPath = '/vault/papers/attention/paper.md'
const marginaliaPath = '/vault/papers/attention/notes/marginalia.md'

describe('paper marginalia conventions', () => {
  beforeEach(() => {
    Reflect.deleteProperty(MOCK_CONTENT, marginaliaPath)
  })

  it('builds the default paper-local marginalia path', () => {
    expect(defaultMarginaliaPathForPaper(paperPath)).toBe(marginaliaPath)
    expect(defaultMarginaliaPathForPaper('papers/attention/paper.md')).toBe('papers/attention/notes/marginalia.md')
  })

  it('links marginalia notes back to the Paper using a vault-relative wikilink', () => {
    expect(paperWikilinkForPaperPath(paperPath)).toBe('[[papers/attention/paper]]')
    expect(paperWikilinkForPaperPath('papers/attention/paper.md')).toBe('[[papers/attention/paper]]')
  })

  it('resolves unique fallback names for explicit new paper notes', () => {
    expect(uniqueMarginaliaPathForPaper(paperPath, new Set([marginaliaPath]))).toBe('/vault/papers/attention/notes/marginalia-2.md')
    expect(uniqueMarginaliaPathForPaper(paperPath, new Set([
      marginaliaPath,
      '/vault/papers/attention/notes/marginalia-2.md',
    ]))).toBe('/vault/papers/attention/notes/marginalia-3.md')
  })

  it('builds the ResearchNote marginalia template with standard sections', () => {
    const template = buildMarginaliaTemplate({
      initialCitation: '@block[attention#b0002]',
      paperPath,
      paperTitle: 'Attention Is All You Need',
    })

    expect(template).toContain('type: ResearchNote')
    expect(template).toContain('paper:\n  - "[[papers/attention/paper]]"')
    expect(template).toContain('# Marginalia: Attention Is All You Need')
    expect(template).toContain('## Key Claims')
    expect(template).toContain('- @block[attention#b0002]')
    expect(template).toContain('## Questions')
    expect(template).toContain('## Notes')
  })

  it('appends selected block citations without rewriting existing note content', () => {
    const content = [
      '---',
      'type: ResearchNote',
      '---',
      '',
      '# Marginalia: Existing',
      '',
      'Existing note.',
    ].join('\n')

    expect(appendBlockCitationToMarginalia(content, '@block[attention#b0002]')).toBe(`${content}\n\n- @block[attention#b0002]\n`)
  })

  it('creates the default marginalia note when it does not exist', async () => {
    const result = await createOrOpenPaperMarginalia({
      paperPath,
      paperTitle: 'Attention Is All You Need',
      vaultPath: '/vault',
    })

    expect(result).toEqual({ created: true, path: marginaliaPath })
    expect(MOCK_CONTENT[marginaliaPath]).toContain('type: ResearchNote')
    expect(MOCK_CONTENT[marginaliaPath]).toContain('paper:\n  - "[[papers/attention/paper]]"')
  })

  it('opens the existing default marginalia note instead of duplicating it', async () => {
    MOCK_CONTENT[marginaliaPath] = '# Existing marginalia\n'

    const result = await createOrOpenPaperMarginalia({
      paperPath,
      paperTitle: 'Attention Is All You Need',
      vaultPath: '/vault',
    })

    expect(result).toEqual({ created: false, path: marginaliaPath })
    expect(MOCK_CONTENT[marginaliaPath]).toBe('# Existing marginalia\n')
  })

  it('reads existing marginalia content for preview panes', async () => {
    MOCK_CONTENT[marginaliaPath] = '# Existing marginalia\n\nA note.'

    await expect(readPaperMarginalia({ paperPath, vaultPath: '/vault' })).resolves.toEqual({
      content: '# Existing marginalia\n\nA note.',
      path: marginaliaPath,
      state: 'ready',
    })
  })

  it('reports missing marginalia without creating it', async () => {
    await expect(readPaperMarginalia({ paperPath, vaultPath: '/vault' })).resolves.toEqual({
      content: '',
      path: marginaliaPath,
      state: 'missing',
    })
    expect(Object.hasOwn(MOCK_CONTENT, marginaliaPath)).toBe(false)
  })

  it('creates a marginalia note with the selected block citation when none exists', async () => {
    const result = await addBlockCitationToMarginalia({
      blockId: 'b0002',
      paperId: 'attention',
      paperPath,
      paperTitle: 'Attention Is All You Need',
      vaultPath: '/vault',
    })

    expect(result).toEqual({ created: true, path: marginaliaPath })
    expect(MOCK_CONTENT[marginaliaPath]).toContain('- @block[attention#b0002]')
  })

  it('appends the selected block citation to existing marginalia', async () => {
    MOCK_CONTENT[marginaliaPath] = '# Existing marginalia\n'

    const result = await addBlockCitationToMarginalia({
      blockId: 'b0002',
      paperId: 'attention',
      paperPath,
      paperTitle: 'Attention Is All You Need',
      vaultPath: '/vault',
    })

    expect(result).toEqual({ created: false, path: marginaliaPath })
    expect(MOCK_CONTENT[marginaliaPath]).toBe('# Existing marginalia\n\n- @block[attention#b0002]\n')
  })
})
