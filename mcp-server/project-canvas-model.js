const PROJECT_CANVAS_SCHEMA = 'project-canvas/v1'
export const PROJECT_OVERVIEW_NODE_ID = 'project_overview'
const PROJECT_OVERVIEW_WIDTH = 420
const PROJECT_OVERVIEW_HEIGHT = 280
const NODE_TYPES = new Set(['note', 'paper', 'paper_block', 'image', 'text', 'task', 'group'])

export function defaultCanvas(projectPath) {
  return {
    version: 1,
    project: projectPath,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [projectOverviewNode(projectPath)],
    edges: [],
    sapientia: { schema: PROJECT_CANVAS_SCHEMA },
  }
}

export function normalizeCanvas(canvas, projectPath) {
  return {
    version: 1,
    project: projectPath,
    viewport: normalizedViewport(canvas.viewport),
    nodes: nodesWithProjectOverview(canvas.nodes, projectPath)
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...canvas.edges].sort((left, right) => left.id.localeCompare(right.id)),
    sapientia: { schema: PROJECT_CANVAS_SCHEMA },
  }
}

function projectOverviewNode(projectPath) {
  return {
    id: PROJECT_OVERVIEW_NODE_ID,
    type: 'note',
    ref: projectPath,
    x: 0,
    y: 0,
    width: PROJECT_OVERVIEW_WIDTH,
    height: PROJECT_OVERVIEW_HEIGHT,
  }
}

function nodesWithProjectOverview(nodes, projectPath) {
  const overviewIndex = nodes.findIndex(node => node.id === PROJECT_OVERVIEW_NODE_ID)
  if (overviewIndex < 0) return [...nodes, projectOverviewNode(projectPath)]
  return nodes.map((node, index) => index === overviewIndex
    ? {
        ...node,
        type: 'note',
        ref: projectPath,
        text: undefined,
        completed: undefined,
      }
    : node)
}

export function validateCanvas(canvas) {
  if (!canvas || !Array.isArray(canvas.nodes) || !Array.isArray(canvas.edges)) {
    throw new Error('Project Canvas JSON is malformed')
  }
  const nodeIds = new Set(canvas.nodes.map(node => node.id))
  if (nodeIds.size !== canvas.nodes.length || canvas.nodes.some(node => !NODE_TYPES.has(node.type))) {
    throw new Error('Project Canvas contains invalid or duplicate nodes')
  }
  if (canvas.edges.some(edge => !nodeIds.has(edge.from) || !nodeIds.has(edge.to))) {
    throw new Error('Project Canvas contains an edge with a missing endpoint')
  }
}

export function normalizeNodeRequest(node) {
  if (!node || !NODE_TYPES.has(node.type)) throw new Error('Project Canvas node type is required')
  const ref = normalizedRef(node.ref)
  if (['note', 'paper', 'paper_block', 'image'].includes(node.type) && !ref) {
    throw new Error(`Project Canvas ${node.type} node requires ref`)
  }
  return {
    type: node.type,
    ref: ref || undefined,
    title: stringValue(node.title),
    text: stringValue(node.text),
    completed: node.type === 'task' ? Boolean(node.completed) : undefined,
  }
}

export function createNode(canvas, request) {
  const width = 240
  const height = 110
  return {
    id: nextNodeId(canvas, request.type),
    ...request,
    x: (900 / 2 - canvas.viewport.x) / canvas.viewport.zoom - width / 2,
    y: (460 / 2 - canvas.viewport.y) / canvas.viewport.zoom - height / 2,
    width,
    height,
  }
}

export function focusCanvasOnNode(canvas, node) {
  return {
    ...canvas,
    viewport: {
      ...canvas.viewport,
      x: 900 / 2 - (node.x + node.width / 2) * canvas.viewport.zoom,
      y: 460 / 2 - (node.y + node.height / 2) * canvas.viewport.zoom,
    },
  }
}

export function nearbyNodeIds(canvas, selectedNodeId, limit = 8) {
  if (!selectedNodeId) return []
  const ids = []
  for (const edge of canvas.edges) {
    const adjacent = edge.from === selectedNodeId ? edge.to : edge.to === selectedNodeId ? edge.from : null
    if (adjacent && !ids.includes(adjacent)) ids.push(adjacent)
  }
  return ids.slice(0, limit)
}

export function relevantEdge(edge, selectedNodeId, nearbyIds) {
  if (!selectedNodeId) return false
  const relevant = new Set([selectedNodeId, ...nearbyIds])
  return relevant.has(edge.from) && relevant.has(edge.to)
}

export function parseBlockCitation(value) {
  const match = stringValue(value)?.match(/^@block\[([^#\]]+)#([^\]]+)\]$/u)
  return match ? { paperId: match[1], blockId: match[2] } : null
}

export function compactNode(node) {
  if (!node) return null
  return {
    id: node.id,
    type: node.type,
    title: node.title ?? null,
    ref: node.ref ?? null,
    text: compactText(node.text, 320),
    completed: node.type === 'task' ? Boolean(node.completed) : null,
  }
}

export function projectProvenance(project) {
  return {
    projectId: project.projectId,
    projectPath: project.projectPath,
    projectTitle: project.projectTitle ?? project.title,
    vaultPath: project.vaultPath,
    vaultLabel: project.vaultLabel,
  }
}

export function projectIdentifier(args) {
  return requiredString(args.projectId ?? args.projectPath, 'projectId')
}

export function requiredString(value, name) {
  const result = stringValue(value)
  if (!result) throw new Error(`${name} is required`)
  return result
}

export function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function noteType(frontmatter) {
  return stringValue(frontmatter.type) ?? stringValue(frontmatter.is_a)
}

export function normalizedRef(value) {
  return stringValue(value)?.replace(/\\/gu, '/').replace(/^\.\//u, '') ?? ''
}

export function slashPath(value) {
  return value.replace(/\\/gu, '/')
}

export function headingTitle(content) {
  return content.match(/^#\s+(.+)$/mu)?.[1]?.trim() ?? null
}

export function compactText(value, limit) {
  const text = stringValue(value)?.replace(/\s+/gu, ' ') ?? null
  if (!text || text.length <= limit) return text
  return `${text.slice(0, limit - 1).trimEnd()}…`
}

export function nodeSearchText(node) {
  return [node.type, node.title, node.text, node.ref].filter(Boolean).join(' ').toLowerCase()
}

export function boundedLimit(value, maximum = 20) {
  return Math.min(maximum, Number.isFinite(value) && value > 0 ? Math.floor(value) : 10)
}

function normalizedViewport(viewport = {}) {
  return {
    x: Number.isFinite(viewport.x) ? viewport.x : 0,
    y: Number.isFinite(viewport.y) ? viewport.y : 0,
    zoom: Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1,
  }
}

function nextNodeId(canvas, type) {
  const ids = new Set(canvas.nodes.map(node => node.id))
  for (let index = 1; index <= canvas.nodes.length + 1; index += 1) {
    const candidate = `${type}_${index}`
    if (!ids.has(candidate)) return candidate
  }
  return `${type}_${canvas.nodes.length + 2}`
}
