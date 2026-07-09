import { access } from 'node:fs/promises'
import path from 'node:path'
import { readPaperBlocks, readPaperMetadata } from './paper-tools.js'
import { getNote } from './vault.js'
import {
  compactNode,
  compactText,
  headingTitle,
  nearbyNodeIds,
  normalizedRef,
  parseBlockCitation,
  projectProvenance,
  relevantEdge,
  slashPath,
  stringValue,
} from './project-canvas-model.js'

export async function buildProjectContext(vaultPath, project, canvas, selectedNodeId) {
  const selectedNode = canvas.nodes.find(node => node.id === selectedNodeId) ?? null
  if (selectedNodeId && !selectedNode) throw new Error(`Project Canvas node not found: ${selectedNodeId}`)
  const nearbyIds = nearbyNodeIds(canvas, selectedNode?.id)
  const nearbyNodes = nearbyIds.flatMap(id => canvas.nodes.find(node => node.id === id) ?? [])
  const relevantNodes = selectedNode ? [selectedNode, ...nearbyNodes] : []
  const [papers, citedBlocks, notes, staleReferenceCount] = await Promise.all([
    readPaperSummaries(vaultPath, canvas.nodes),
    readCitedBlocks(vaultPath, relevantNodes),
    readNoteSnippets(vaultPath, relevantNodes),
    countStaleReferences(vaultPath, canvas.nodes),
  ])
  return {
    ...projectProvenance(project),
    state: 'ready',
    summary: {
      nodeCount: canvas.nodes.length,
      edgeCount: canvas.edges.length,
      referencedPaperCount: papers.length,
      citedBlockCount: canvas.nodes.filter(node => node.type === 'paper_block').length,
      staleReferenceCount,
    },
    selectedNode: compactNode(selectedNode),
    nearbyNodes: nearbyNodes.map(compactNode),
    relationships: canvas.edges.filter(edge => relevantEdge(edge, selectedNode?.id, nearbyIds)),
    papers,
    citedBlocks,
    notes,
  }
}

async function readPaperSummaries(vaultPath, nodes) {
  const identifiers = [...new Set(nodes.flatMap(node => {
    if (node.type === 'paper' && node.ref) return [node.ref]
    const citation = parseBlockCitation(node.ref)
    return citation ? [citation.paperId] : []
  }))].slice(0, 8)
  return compactSuccessfulResults(identifiers.map(async identifier => {
    const paper = await readPaperMetadata(vaultPath, { paperId: identifier })
    return {
      paperId: paper.paperId,
      title: paper.title,
      authors: paper.metadata?.authors ?? paper.frontmatter?.authors ?? [],
      year: paper.metadata?.year ?? paper.frontmatter?.year ?? null,
      venue: paper.metadata?.venue ?? paper.frontmatter?.venue ?? null,
    }
  }))
}

async function readCitedBlocks(vaultPath, nodes) {
  const cited = nodes.flatMap(node => {
    const citation = parseBlockCitation(node.ref)
    return citation ? [{ node, citation }] : []
  })
  return compactSuccessfulResults(cited.map(async ({ node, citation }) => {
    const paper = await readPaperBlocks(vaultPath, {
      paperId: citation.paperId,
      blockIds: [citation.blockId],
    })
    const block = paper.blocks[0]
    if (!block) return null
    return {
      nodeId: node.id,
      paperId: paper.paperId,
      paperTitle: paper.title,
      blockId: block.blockId,
      page: block.page,
      text: compactText(block.text ?? block.caption, 800),
      blockCitation: block.blockCitation,
    }
  }))
}

async function readNoteSnippets(vaultPath, nodes) {
  const noteNodes = nodes.filter(node => node.type === 'note' && node.ref).slice(0, 6)
  return compactSuccessfulResults(noteNodes.map(async node => {
    const note = await getNote(vaultPath, node.ref)
    return {
      nodeId: node.id,
      path: slashPath(note.path),
      title: stringValue(note.frontmatter.title) ?? headingTitle(note.content) ?? path.basename(note.path, '.md'),
      snippet: compactText(note.content.replace(/^#\s+.*$/mu, '').trim(), 400),
    }
  }))
}

async function countStaleReferences(vaultPath, nodes) {
  const states = await Promise.all(nodes.map(node => isStaleReference(vaultPath, node)))
  return states.filter(Boolean).length
}

async function isStaleReference(vaultPath, node) {
  if (!node.ref || ['text', 'task', 'group'].includes(node.type)) return false
  try {
    if (node.type === 'paper_block') {
      const citation = parseBlockCitation(node.ref)
      if (!citation) return true
      const result = await readPaperBlocks(vaultPath, { paperId: citation.paperId, blockIds: [citation.blockId] })
      return result.blocks.length === 0
    }
    if (node.type === 'image') {
      await access(path.join(vaultPath, normalizedRef(node.ref)))
      return false
    }
    await getNote(vaultPath, node.ref)
    return false
  } catch {
    return true
  }
}

async function compactSuccessfulResults(tasks) {
  const results = await Promise.all(tasks.map(task => task.catch(() => null)))
  return results.filter(Boolean)
}
