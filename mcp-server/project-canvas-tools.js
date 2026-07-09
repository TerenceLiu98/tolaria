import { buildProjectContext } from './project-canvas-context.js'
import {
  boundedLimit,
  compactNode,
  compactText,
  createNode,
  defaultCanvas,
  focusCanvasOnNode,
  nodeSearchText,
  normalizeNodeRequest,
  normalizedRef,
  projectIdentifier,
  projectProvenance,
  requiredString,
} from './project-canvas-model.js'
import {
  findProject,
  listProjectCanvases,
  readCanvasFile,
  writeCanvasFile,
} from './project-canvas-storage.js'

export { listProjectCanvases }

export async function readProjectCanvas(vaultPath, args = {}) {
  const project = await findProject(vaultPath, projectIdentifier(args))
  const result = {
    ...projectProvenance(project),
    canvasPath: project.canvasPath,
    state: project.state,
  }
  if (project.state === 'missing') return { ...result, canvas: null }
  return { ...result, canvas: await readCanvasFile(vaultPath, project) }
}

export async function searchProjectCanvas(vaultPath, args = {}) {
  const query = requiredString(args.query, 'query').toLowerCase()
  const limit = boundedLimit(args.limit)
  const projects = args.projectId
    ? [await findProject(vaultPath, projectIdentifier(args))]
    : await listProjectCanvases(vaultPath)
  const results = []
  for (const project of projects) {
    if (project.state === 'missing') continue
    const canvas = await readCanvasFile(vaultPath, project)
    for (const node of canvas.nodes) {
      if (!nodeSearchText(node).includes(query)) continue
      results.push(searchResult(project, node))
      if (results.length >= limit) return { query, results, truncated: true }
    }
  }
  return { query, results, truncated: false }
}

export async function readProjectContext(vaultPath, args = {}) {
  const result = await readProjectCanvas(vaultPath, args)
  if (!result.canvas) return { ...projectProvenance(result), state: 'missing' }
  return buildProjectContext(vaultPath, result, result.canvas, args.selectedNodeId)
}

export async function addProjectCanvasNode(vaultPath, args = {}) {
  const project = await findProject(vaultPath, projectIdentifier(args))
  const request = normalizeNodeRequest(args.node)
  const canvas = project.state === 'ready'
    ? await readCanvasFile(vaultPath, project)
    : defaultCanvas(project.projectPath)
  const existing = request.ref
    ? canvas.nodes.find(node => normalizedRef(node.ref) === request.ref)
    : null
  const node = existing ?? createNode(canvas, request)
  const nextCanvas = existing
    ? focusCanvasOnNode(canvas, existing)
    : { ...canvas, nodes: [...canvas.nodes, node] }
  await writeCanvasFile(vaultPath, project, nextCanvas)
  return {
    ...projectProvenance(project),
    canvasPath: project.canvasPath,
    createdCanvas: project.state === 'missing',
    duplicate: Boolean(existing),
    node: compactNode(node),
  }
}

function searchResult(project, node) {
  return {
    ...projectProvenance(project),
    nodeId: node.id,
    type: node.type,
    title: node.title ?? null,
    ref: node.ref ?? null,
    text: compactText(node.text, 320),
  }
}
