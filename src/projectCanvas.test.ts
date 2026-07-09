import {
  PROJECT_CANVAS_SCHEMA,
  defaultProjectCanvas,
  normalizeProjectCanvas,
  validateProjectCanvas,
  type ProjectCanvas,
  type ProjectCanvasEdgeKind,
  type ProjectCanvasNodeType,
} from './projectCanvas'

describe('projectCanvas', () => {
  it('creates a default local-first canvas for a Project note', () => {
    expect(defaultProjectCanvas('projects/alpha/project.md')).toEqual({
      version: 1,
      project: 'projects/alpha/project.md',
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
      sapientia: { schema: PROJECT_CANVAS_SCHEMA },
    })
  })

  it('normalizes schema, project path, viewport, and stable ordering', () => {
    const canvas: ProjectCanvas = {
      version: 12,
      project: 'old.md',
      viewport: { x: Number.NaN, y: 5, zoom: 0 },
      nodes: [
        node('z_node', 'text'),
        node('a_node', 'note', { ref: 'notes/a.md' }),
      ],
      edges: [
        { from: 'z_node', id: 'z_edge', kind: 'related', to: 'a_node' },
        { from: 'a_node', id: 'a_edge', kind: 'supports', to: 'z_node' },
      ],
      sapientia: { schema: 'old' },
    }

    expect(normalizeProjectCanvas(canvas, 'projects/alpha/project.md')).toMatchObject({
      version: 1,
      project: 'projects/alpha/project.md',
      viewport: { x: 0, y: 5, zoom: 1 },
      sapientia: { schema: PROJECT_CANVAS_SCHEMA },
    })
    expect(normalizeProjectCanvas(canvas, 'projects/alpha/project.md').nodes.map(item => item.id))
      .toEqual(['a_node', 'z_node'])
    expect(normalizeProjectCanvas(canvas, 'projects/alpha/project.md').edges.map(item => item.id))
      .toEqual(['a_edge', 'z_edge'])
  })

  it('covers every Phase 1 node and edge kind', () => {
    const nodeTypes: ProjectCanvasNodeType[] = ['note', 'paper', 'paper_block', 'text', 'task', 'group']
    const edgeKinds: ProjectCanvasEdgeKind[] = ['related', 'supports', 'contradicts', 'depends_on', 'needs_reading']
    const canvas: ProjectCanvas = {
      ...defaultProjectCanvas('projects/alpha/project.md'),
      nodes: nodeTypes.map((type, index) => node(`node_${index}`, type)),
      edges: edgeKinds.map((kind, index) => ({
        from: 'node_0',
        id: `edge_${index}`,
        kind,
        to: `node_${Math.min(index + 1, nodeTypes.length - 1)}`,
      })),
    }

    expect(canvas.nodes.map(item => item.type)).toEqual(nodeTypes)
    expect(canvas.edges.map(item => item.kind)).toEqual(edgeKinds)
    expect(validateProjectCanvas(canvas)).toEqual([])
  })

  it('reports duplicate ids and missing edge targets before save', () => {
    const canvas: ProjectCanvas = {
      ...defaultProjectCanvas('projects/alpha/project.md'),
      nodes: [
        node('duplicate', 'note'),
        node('duplicate', 'text'),
      ],
      edges: [
        { from: 'duplicate', id: 'edge_1', kind: 'related', to: 'missing' },
        { from: 'missing', id: 'edge_1', kind: 'supports', to: 'duplicate' },
      ],
    }

    expect(validateProjectCanvas(canvas)).toEqual([
      'Project Canvas node id is duplicated: duplicate',
      'Project Canvas edge edge_1 references missing target node missing',
      'Project Canvas edge id is duplicated: edge_1',
      'Project Canvas edge edge_1 references missing source node missing',
    ])
  })
})

function node(
  id: string,
  type: ProjectCanvasNodeType,
  options: { ref?: string } = {},
) {
  return {
    height: 120,
    id,
    ref: options.ref,
    title: undefined,
    text: undefined,
    type,
    width: 240,
    x: 0,
    y: 0,
  }
}
