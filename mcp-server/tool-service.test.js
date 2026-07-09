import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMcpToolService } from './tool-service.js'

let tmpDir
let firstVault
let secondVault

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'tolaria-mcp-service-'))
  firstVault = path.join(tmpDir, 'First Vault')
  secondVault = path.join(tmpDir, 'Second Vault')

  await seedVault(firstVault, {
    'note/shared.md': noteFixture('Shared Note', 'Shared content from the first vault.'),
    'note/alpha.md': noteFixture('Alpha Project', 'Project planning in the first vault.'),
    'projects/research.md': projectFixture('Research Map', 'research-map'),
    'projects/research.canvas.json': projectCanvasFixture(),
    'papers/kan-autoencoders/paper.md': paperFixture({
      paperId: 'kan-autoencoders',
      title: 'Kolmogorov-Arnold Network Autoencoders',
      authors: ['Mohammadamin Moradi', 'Shirin Panahi'],
      year: 2026,
      venue: 'AAAI',
      body: '# Kolmogorov-Arnold Network Autoencoders\n\n@block[kan-autoencoders#b0002]\n',
    }),
    'papers/kan-autoencoders/blocks.jsonl': blocksFixture('kan-autoencoders', [
      { id: 'b0001', kind: 'title', page: 1, text: 'Kolmogorov-Arnold Network Autoencoders' },
      { id: 'b0002', kind: 'paragraph', page: 2, text: 'KAN autoencoders sparsify latent representations for reconstruction.' },
      { id: 'b0003', kind: 'heading', page: 3, text: 'Experiments' },
    ]),
    'papers/kan-autoencoders/metadata.json': JSON.stringify({
      paperId: 'kan-autoencoders',
      status: 'ready',
      confidence: 0.91,
      title: 'Kolmogorov-Arnold Network Autoencoders',
      authors: ['Mohammadamin Moradi', 'Shirin Panahi'],
      year: 2026,
      venue: 'AAAI',
      venueType: 'conference',
      sources: [],
      candidates: [],
      errors: [],
    }),
    'papers/kan-autoencoders/source.pdf': 'fixture pdf',
    'loose-paper.md': paperFixture({
      paperId: 'loose-paper',
      title: 'Loose Paper Note',
      authors: ['Loose Author'],
      year: 2024,
      venue: 'Local Workshop',
      body: '# Loose Paper Note\n\n@block[loose-paper#b0001]\n',
    }),
    'blocks.jsonl': blocksFixture('loose-paper', [
      { id: 'b0001', kind: 'paragraph', text: 'Loose paper evidence without page provenance.' },
    ]),
  })
  await seedVault(secondVault, {
    'AGENTS.md': '# Second Vault Rules\n',
    'note/shared.md': noteFixture('Shared Note', 'Shared content from the second vault.'),
    'note/beta.md': noteFixture('Beta Project', 'Project planning in the second vault.'),
    'projects/research.md': projectFixture('Research Map Copy', 'research-map'),
    'papers/kan-autoencoders/paper.md': paperFixture({
      paperId: 'kan-autoencoders',
      title: 'Kolmogorov-Arnold Network Autoencoders Draft',
      authors: ['Draft Author'],
      year: 2025,
      venue: 'arXiv',
      body: '# Kolmogorov-Arnold Network Autoencoders Draft\n',
    }),
    'papers/kan-autoencoders/blocks.jsonl': blocksFixture('kan-autoencoders', [
      { id: 'b0001', kind: 'title', page: 1, text: 'Kolmogorov-Arnold Network Autoencoders Draft' },
    ]),
  })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('createMcpToolService', () => {
  it('requires vaultPath when reading an ambiguous note path', async () => {
    const service = makeService()

    await assert.rejects(
      () => service.readNote({ path: 'note/shared.md' }),
      /Note path is ambiguous across active vaults/,
    )

    const note = await service.readNote({
      path: 'note/shared.md',
      vaultPath: secondVault,
    })

    assert.equal(note.vaultPath, secondVault)
    assert.equal(note.vaultLabel, 'Second Vault')
    assert.match(note.content, /second vault/)
  })

  it('creates notes with fallback markdown and emits refresh and tab actions', async () => {
    const emittedActions = []
    const service = makeService({ emittedActions })
    const absolutePath = path.join(secondVault, 'note/created.md')

    const note = await service.createNote({
      path: absolutePath,
      title: 'Created From MCP',
      type: 'Project',
    })

    assert.equal(note.path, 'note/created.md')
    assert.equal(note.vaultPath, secondVault)
    assert.equal(path.basename(note.absolutePath), 'created.md')
    assert.equal(
      await readFile(note.absolutePath, 'utf-8'),
      '---\ntype: "Project"\n---\n\n# Created From MCP\n',
    )
    assert.deepEqual(emittedActions, [
      { action: 'vault_changed', payload: { path: absolutePath } },
      { action: 'open_tab', payload: { path: absolutePath } },
    ])
  })

  it('searches active vaults with consistent vault metadata', async () => {
    const service = makeService()

    const results = await service.searchNotes({ query: 'planning', limit: 2 })

    assert.equal(results.length, 2)
    assert.deepEqual(
      results.map(({ path: notePath, vaultPath, vaultLabel }) => ({
        notePath,
        vaultPath,
        vaultLabel,
      })),
      [
        { notePath: 'note/alpha.md', vaultPath: firstVault, vaultLabel: 'First Vault' },
        { notePath: 'note/beta.md', vaultPath: secondVault, vaultLabel: 'Second Vault' },
      ],
    )
  })

  it('searches Paper metadata across active vaults with compact provenance', async () => {
    const service = makeService()

    const listed = await service.listPapers({ vaultPath: firstVault })
    const results = await service.searchPapers({ query: 'autoencoders' })

    assert.equal(listed.length, 2)
    assert.equal(listed[0].wikilink, '[[Kolmogorov-Arnold Network Autoencoders]]')
    assert.equal(listed[1].wikilink, '[[Loose Paper Note]]')
    assert.equal(listed[0].metadata, undefined)
    assert.equal(results.length, 2)
    assert.deepEqual(
      results.map(({ paperId, title, vaultLabel, wikilink }) => ({ paperId, title, vaultLabel, wikilink })),
      [
        {
          paperId: 'kan-autoencoders',
          title: 'Kolmogorov-Arnold Network Autoencoders',
          vaultLabel: 'First Vault',
          wikilink: '[[Kolmogorov-Arnold Network Autoencoders]]',
        },
        {
          paperId: 'kan-autoencoders',
          title: 'Kolmogorov-Arnold Network Autoencoders Draft',
          vaultLabel: 'Second Vault',
          wikilink: '[[Kolmogorov-Arnold Network Autoencoders Draft]]',
        },
      ],
    )
    assert.equal(results[0].metadata, undefined)
  })

  it('requires vaultPath when a Paper id is ambiguous across active vaults', async () => {
    const service = makeService()

    await assert.rejects(
      () => service.readPaperMetadata({ paperId: 'kan-autoencoders' }),
      /Paper identifier is ambiguous across active vaults/,
    )

    const result = await service.readPaperMetadata({ paperId: 'kan-autoencoders', vaultPath: firstVault })

    assert.equal(result.paperId, 'kan-autoencoders')
    assert.equal(result.vaultPath, firstVault)
    assert.equal(result.metadata.status, 'ready')
  })

  it('reads Paper outlines and exact blocks with block citations', async () => {
    const service = makeService()

    const outline = await service.readPaperOutline({ paperId: 'kan-autoencoders', vaultPath: firstVault })
    const blocks = await service.readPaperBlocks({
      paperId: 'kan-autoencoders',
      blockIds: ['b0002'],
      vaultPath: firstVault,
    })
    const citation = await service.getBlockCitation({
      paperId: 'kan-autoencoders',
      blockId: 'b0002',
      vaultPath: firstVault,
    })

    assert.deepEqual(outline.outline.map(item => item.blockId), ['b0001', 'b0003'])
    assert.equal(blocks.blocks.length, 1)
    assert.equal(blocks.blocks[0].blockCitation, '@block[kan-autoencoders#b0002]')
    assert.match(blocks.blocks[0].text, /sparsify latent/)
    assert.equal(citation.blockCitation, '@block[kan-autoencoders#b0002]')
    assert.equal(citation.page, 2)
  })

  it('discovers non-canonical Paper notes and degrades missing block pages to null', async () => {
    const service = makeService()

    const listed = await service.listPapers({ vaultPath: firstVault })
    const blocks = await service.readPaperBlocks({
      paperId: 'loose-paper',
      blockIds: ['b0001'],
      vaultPath: firstVault,
    })

    assert.deepEqual(
      listed.map(paper => ({ paperId: paper.paperId, path: paper.path })),
      [
        { paperId: 'kan-autoencoders', path: 'papers/kan-autoencoders/paper.md' },
        { paperId: 'loose-paper', path: 'loose-paper.md' },
      ],
    )
    assert.equal(blocks.blocks.length, 1)
    assert.equal(blocks.blocks[0].page, null)
    assert.equal(blocks.blocks[0].blockCitation, '@block[loose-paper#b0001]')
  })

  it('searches Paper blocks without dumping full papers', async () => {
    const service = makeService()

    const result = await service.searchPaperBlocks({ query: 'latent', vaultPath: firstVault })

    assert.equal(result.results.length, 1)
    assert.equal(result.results[0].paperId, 'kan-autoencoders')
    assert.equal(result.results[0].blockId, 'b0002')
    assert.match(result.results[0].snippet, /latent representations/)
    assert.equal(result.results[0].text.includes('\n'), false)
  })

  it('reads and searches Project canvases with vault provenance', async () => {
    const service = makeService()

    await assert.rejects(
      () => service.readProjectCanvas({ projectId: 'research-map' }),
      /Project identifier is ambiguous across active vaults/,
    )

    const canvas = await service.readProjectCanvas({
      projectId: 'research-map',
      vaultPath: firstVault,
    })
    const search = await service.searchProjectCanvas({
      projectId: 'research-map',
      query: 'latent',
      vaultPath: firstVault,
    })

    assert.equal(canvas.projectTitle, 'Research Map')
    assert.equal(canvas.vaultPath, firstVault)
    assert.deepEqual(search.results.map(result => result.nodeId), ['claim'])
    assert.equal(search.results[0].vaultLabel, 'First Vault')
  })

  it('reads compact Project context with exact Paper evidence', async () => {
    const service = makeService()

    const context = await service.readProjectContext({
      projectId: 'research-map',
      selectedNodeId: 'claim',
      vaultPath: firstVault,
    })

    assert.equal(context.selectedNode.id, 'claim')
    assert.equal(context.citedBlocks[0].blockCitation, '@block[kan-autoencoders#b0002]')
    assert.equal(context.citedBlocks[0].page, 2)
    assert.match(context.citedBlocks[0].text, /latent representations/)
    assert.equal(context.notes[0].path, 'note/alpha.md')
  })

  it('requires explicit writable vault and adds Project Canvas nodes without duplicates', async () => {
    const service = makeService()

    await assert.rejects(
      () => service.addNodeToProjectCanvas({
        projectId: 'research-map',
        node: { type: 'note', ref: 'note/shared.md' },
      }),
      /Project path is ambiguous across active vaults/,
    )

    const added = await service.addNodeToProjectCanvas({
      projectId: 'research-map',
      node: { type: 'note', ref: 'note/shared.md', title: 'Shared Note' },
      vaultPath: firstVault,
    })
    const duplicate = await service.addNodeToProjectCanvas({
      projectId: 'research-map',
      node: { type: 'note', ref: 'note/shared.md', title: 'Shared Note' },
      vaultPath: firstVault,
    })

    assert.equal(added.duplicate, false)
    assert.equal(duplicate.duplicate, true)
    assert.equal(duplicate.vaultPath, firstVault)
  })

  it('lists active vaults with agent-instruction metadata', async () => {
    const service = makeService()

    assert.deepEqual(await service.listVaults(), {
      vaults: [
        {
          path: firstVault,
          label: 'First Vault',
          agentInstructionsPath: null,
          hasAgentInstructions: false,
        },
        {
          path: secondVault,
          label: 'Second Vault',
          agentInstructionsPath: path.join(secondVault, 'AGENTS.md'),
          hasAgentInstructions: true,
        },
      ],
    })
  })

  it('emits transport-neutral UI intents for note opening and filters', () => {
    const emittedActions = []
    const service = makeService({ emittedActions })

    service.openNoteAsTab({ path: 'note/beta.md', vaultPath: secondVault })
    service.openNoteInEditor({ path: 'note/beta.md', vaultPath: secondVault })
    service.highlightEditor({ element: 'editor', path: 'note/beta.md' })
    service.setFilter({ type: 'Project' })
    service.refreshVault({ path: 'note/beta.md', vaultPath: secondVault })

    assert.deepEqual(emittedActions, [
      { action: 'vault_changed', payload: { path: path.join(secondVault, 'note/beta.md') } },
      { action: 'open_tab', payload: { path: path.join(secondVault, 'note/beta.md') } },
      { action: 'vault_changed', payload: { path: path.join(secondVault, 'note/beta.md') } },
      { action: 'open_note', payload: { path: path.join(secondVault, 'note/beta.md') } },
      { action: 'highlight', payload: { element: 'editor', path: 'note/beta.md' } },
      { action: 'set_filter', payload: { filterType: 'Project' } },
      { action: 'vault_changed', payload: { path: path.join(secondVault, 'note/beta.md') } },
    ])
  })
})

function makeService({ emittedActions = [] } = {}) {
  return createMcpToolService({
    resolveVaultPaths: () => [firstVault, secondVault],
    emitUiAction: (action, payload) => {
      emittedActions.push({ action, payload })
    },
  })
}

async function seedVault(vaultPath, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(vaultPath, relativePath)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf-8')
  }
}

function noteFixture(title, body) {
  return `---\ntitle: ${JSON.stringify(title)}\ntype: Note\n---\n\n# ${title}\n\n${body}\n`
}

function projectFixture(title, projectId) {
  return `---\ntitle: ${JSON.stringify(title)}\ntype: Project\nproject_id: ${projectId}\n---\n\n# ${title}\n`
}

function projectCanvasFixture() {
  return JSON.stringify({
    version: 1,
    project: 'projects/research.md',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: 'claim', type: 'text', x: 0, y: 0, width: 240, height: 110, title: 'Latent claim', text: 'Latent representations need evidence.' },
      { id: 'evidence', type: 'paper_block', ref: '@block[kan-autoencoders#b0002]', x: 300, y: 0, width: 240, height: 110 },
      { id: 'note', type: 'note', ref: 'note/alpha.md', x: 300, y: 150, width: 240, height: 110 },
    ],
    edges: [
      { id: 'supports', from: 'evidence', to: 'claim', kind: 'supports' },
      { id: 'related', from: 'claim', to: 'note', kind: 'related' },
    ],
    sapientia: { schema: 'project-canvas/v1' },
  }, null, 2)
}

function paperFixture({ paperId, title, authors, year, venue, body }) {
  return [
    '---',
    'type: Paper',
    `title: ${JSON.stringify(title)}`,
    `paper_id: ${JSON.stringify(paperId)}`,
    'source_pdf: source.pdf',
    'blocks: blocks.jsonl',
    'comments: comments.jsonl',
    'parse_status: parsed',
    'metadata_status: ready',
    `authors: [${authors.map(author => JSON.stringify(author)).join(', ')}]`,
    `year: ${year}`,
    `venue: ${JSON.stringify(venue)}`,
    '---',
    '',
    body,
  ].join('\n')
}

function blocksFixture(paperId, blocks) {
  return blocks.map(block => JSON.stringify({
    paper_id: paperId,
    hash: `sha256:${block.id}`,
    ...block,
  })).join('\n') + '\n'
}
