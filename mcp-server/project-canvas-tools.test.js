import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  addProjectCanvasNode,
  listProjectCanvases,
  readProjectCanvas,
  readProjectContext,
  searchProjectCanvas,
} from './project-canvas-tools.js'
import { PROJECT_OVERVIEW_NODE_ID } from './project-canvas-model.js'

let vaultPath

beforeEach(async () => {
  vaultPath = await mkdtemp(path.join(os.tmpdir(), 'sapientia-project-canvas-'))
  await seedVault(vaultPath, {
    'projects/agents/project.md': projectNote('Agent Research', 'agent-research'),
    'projects/agents/project.canvas.json': JSON.stringify(canvasFixture(), null, 2),
    'projects/loose.md': projectNote('Loose Project', 'loose-project'),
    'notes/brief.md': noteFixture('Brief', 'A bounded local note snippet about agent evaluation.'),
    'papers/evidence/paper.md': paperFixture(),
    'papers/evidence/blocks.jsonl': `${JSON.stringify({
      id: 'b0002',
      kind: 'paragraph',
      hash: 'sha256:evidence',
      page: 4,
      text: 'Tool-using agents improve when evaluation includes exact evidence traces.',
    })}\n`,
    'papers/evidence/metadata.json': JSON.stringify({
      paperId: 'evidence-paper',
      status: 'ready',
      title: 'Evidence Traces for Agents',
      authors: ['Ada Researcher'],
      year: 2026,
      venue: 'AAAI',
    }),
  })
})

afterEach(async () => {
  await rm(vaultPath, { recursive: true, force: true })
})

describe('Project Canvas MCP tools', () => {
  it('discovers canonical and adjacent Project canvases', async () => {
    const projects = await listProjectCanvases(vaultPath)

    assert.deepEqual(projects.map(project => ({
      canvasPath: project.canvasPath,
      projectId: project.projectId,
      projectPath: project.projectPath,
      state: project.state,
    })), [
      {
        canvasPath: 'projects/agents/project.canvas.json',
        projectId: 'agent-research',
        projectPath: 'projects/agents/project.md',
        state: 'ready',
      },
      {
        canvasPath: 'projects/loose.canvas.json',
        projectId: 'loose-project',
        projectPath: 'projects/loose.md',
        state: 'missing',
      },
    ])
  })

  it('reads and searches compact Canvas nodes', async () => {
    const read = await readProjectCanvas(vaultPath, { projectId: 'agent-research' })
    const search = await searchProjectCanvas(vaultPath, {
      projectId: 'agent-research',
      query: 'evaluation',
    })

    assert.equal(read.canvas.nodes.length, 5)
    assert.equal(read.canvas.nodes.some(node => node.id === PROJECT_OVERVIEW_NODE_ID), true)
    assert.equal(read.canvas.edges.length, 3)
    assert.equal(read.canvas.edges[0].routing, 'orthogonal')
    assert.deepEqual(search.results.map(result => result.nodeId), ['claim', 'note'])
    assert.equal(search.results[0].projectId, 'agent-research')
    assert.equal(search.results[0].vaultPath, vaultPath)
  })

  it('builds selected-node context with one-hop notes and exact evidence', async () => {
    const context = await readProjectContext(vaultPath, {
      projectId: 'agent-research',
      selectedNodeId: 'claim',
    })

    assert.equal(context.selectedNode.id, 'claim')
    assert.deepEqual(context.nearbyNodes.map(node => node.id), ['note', 'paper', 'evidence'])
    assert.equal(context.notes[0].path, 'notes/brief.md')
    assert.match(context.notes[0].snippet, /bounded local note snippet/)
    assert.equal(context.papers[0].paperId, 'evidence-paper')
    assert.equal(context.citedBlocks[0].blockCitation, '@block[evidence-paper#b0002]')
    assert.equal(context.citedBlocks[0].page, 4)
    assert.match(context.citedBlocks[0].text, /exact evidence traces/)
  })

  it('creates a missing Canvas and focuses duplicate references', async () => {
    const first = await addProjectCanvasNode(vaultPath, {
      projectId: 'loose-project',
      node: { type: 'note', ref: 'notes/brief.md', title: 'Brief' },
    })
    const canvasPath = path.join(vaultPath, 'projects/loose.canvas.json')
    const moved = JSON.parse(await readFile(canvasPath, 'utf-8'))
    moved.viewport = { x: 120, y: -80, zoom: 1 }
    await writeFile(canvasPath, `${JSON.stringify(moved, null, 2)}\n`)
    const duplicate = await addProjectCanvasNode(vaultPath, {
      projectId: 'loose-project',
      node: { type: 'note', ref: 'notes/brief.md', title: 'Duplicate title' },
    })
    const saved = JSON.parse(await readFile(canvasPath, 'utf-8'))

    assert.equal(first.createdCanvas, true)
    assert.equal(first.duplicate, false)
    assert.equal(duplicate.createdCanvas, false)
    assert.equal(duplicate.duplicate, true)
    assert.equal(saved.nodes.length, 2)
    assert.equal(saved.nodes.some(node => node.id === PROJECT_OVERVIEW_NODE_ID), true)
    assert.deepEqual(saved.viewport, { x: 0, y: 0, zoom: 1 })
  })

  it('rejects non-Project notes and paths outside the vault', async () => {
    await assert.rejects(
      () => addProjectCanvasNode(vaultPath, {
        projectId: 'notes/brief.md',
        node: { type: 'text', text: 'Unsafe' },
      }),
      /type: Project/,
    )
    await assert.rejects(
      () => readProjectCanvas(vaultPath, { projectId: '../outside.md' }),
      /inside the active vault/,
    )

    const invalidRouting = canvasFixture()
    invalidRouting.edges[0].routing = 'diagonal'
    await writeFile(
      path.join(vaultPath, 'projects/agents/project.canvas.json'),
      JSON.stringify(invalidRouting, null, 2),
    )
    await assert.rejects(
      () => readProjectCanvas(vaultPath, { projectId: 'agent-research' }),
      /unsupported connector routing/,
    )

    const invalidParent = canvasFixture()
    invalidParent.nodes[0].parentId = 'missing'
    await writeFile(
      path.join(vaultPath, 'projects/agents/project.canvas.json'),
      JSON.stringify(invalidParent, null, 2),
    )
    await assert.rejects(
      () => readProjectCanvas(vaultPath, { projectId: 'agent-research' }),
      /missing parent group/,
    )

    const cyclicGroups = canvasFixture()
    cyclicGroups.nodes.push(
      { id: 'outer', type: 'group', parentId: 'inner', x: 0, y: 500, width: 500, height: 300 },
      { id: 'inner', type: 'group', parentId: 'outer', x: 30, y: 540, width: 400, height: 220 },
    )
    await writeFile(
      path.join(vaultPath, 'projects/agents/project.canvas.json'),
      JSON.stringify(cyclicGroups, null, 2),
    )
    await assert.rejects(
      () => readProjectCanvas(vaultPath, { projectId: 'agent-research' }),
      /group hierarchy contains a cycle/,
    )
  })
})

function canvasFixture() {
  return {
    version: 1,
    project: 'projects/agents/project.md',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: 'claim', type: 'text', x: 0, y: 0, width: 240, height: 110, title: 'Evaluation claim', text: 'Evaluation needs provenance.' },
      { id: 'evidence', type: 'paper_block', ref: '@block[evidence-paper#b0002]', x: 300, y: 0, width: 240, height: 110 },
      { id: 'note', type: 'note', ref: 'notes/brief.md', title: 'Evaluation brief', x: 300, y: 150, width: 240, height: 110 },
      { id: 'paper', type: 'paper', ref: 'papers/evidence/paper.md', x: 300, y: 300, width: 240, height: 110 },
    ],
    edges: [
      { id: 'supports', from: 'evidence', to: 'claim', kind: 'supports' },
      { id: 'related-note', from: 'claim', to: 'note', kind: 'related', routing: 'orthogonal' },
      { id: 'related-paper', from: 'claim', to: 'paper', kind: 'related' },
    ],
    sapientia: { schema: 'project-canvas/v1' },
  }
}

function projectNote(title, projectId) {
  return `---\ntype: Project\nproject_id: ${projectId}\ntitle: ${title}\n---\n\n# ${title}\n`
}

function noteFixture(title, body) {
  return `---\ntype: Note\ntitle: ${title}\n---\n\n# ${title}\n\n${body}\n`
}

function paperFixture() {
  return `---\ntype: Paper\npaper_id: evidence-paper\ntitle: Evidence Traces for Agents\nauthors:\n  - Ada Researcher\nyear: 2026\nvenue: AAAI\nparse_status: parsed\n---\n\n# Evidence Traces for Agents\n`
}

async function seedVault(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath)
    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, content)
  }
}
