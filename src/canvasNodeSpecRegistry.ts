import type { ProjectCanvasNode, ProjectCanvasNodeType } from './projectCanvas'

export type CanvasNodePresentation = 'overview' | 'preview' | 'edit'
export type CanvasNodeSpecKey = ProjectCanvasNodeType | 'overview'

export interface CanvasNodeGeometry {
  width: number
  height: number
  minWidth: number
  minHeight: number
}

export interface CanvasNodeSpec {
  readonly key: CanvasNodeSpecKey
  readonly type: ProjectCanvasNodeType
  readonly canEdit: boolean
  readonly geometry: CanvasNodeGeometry
  readonly supportsChildren: boolean
  readonly canResize: boolean
  readonly acceptsDrop: boolean
  readonly inspectorFields: readonly ('title' | 'reference' | 'text' | 'completed' | 'edge')[]
  readonly preview: (node: ProjectCanvasNode, presentation: CanvasNodePresentation) => { title: string; text?: string }
  readonly staleLabel: (node: ProjectCanvasNode) => string
  readonly clipboard: (node: ProjectCanvasNode) => ProjectCanvasNode
}

const DEFAULT_GEOMETRY: CanvasNodeGeometry = { width: 260, height: 150, minWidth: 180, minHeight: 110 }

function defaultPreview(node: ProjectCanvasNode): { title: string; text?: string } {
  return { title: node.title ?? node.ref ?? 'Untitled node', text: node.text }
}

function copyNode(node: ProjectCanvasNode): ProjectCanvasNode {
  return { ...node }
}

export class CanvasNodeSpecRegistry {
  private readonly specs = new Map<CanvasNodeSpecKey, CanvasNodeSpec>()

  constructor(specs: readonly CanvasNodeSpec[] = CanvasNodeSpecRegistry.defaults()) {
    for (const spec of specs) this.register(spec)
  }

  register(spec: CanvasNodeSpec): void {
    this.specs.set(spec.key, spec)
  }

  get(type: ProjectCanvasNodeType): CanvasNodeSpec {
    return this.specs.get(type) ?? this.specs.get('text') ?? CanvasNodeSpecRegistry.defaults().find(spec => spec.type === 'text')!
  }

  getForNode(node: ProjectCanvasNode): CanvasNodeSpec {
    if (node.id === 'project_overview') return this.specs.get('overview') ?? this.get('note')
    return this.get(node.type)
  }

  has(type: ProjectCanvasNodeType): boolean {
    return this.specs.has(type)
  }

  static defaults(): CanvasNodeSpec[] {
    const types: ProjectCanvasNodeType[] = ['note', 'paper', 'paper_block', 'image', 'text', 'task', 'group']
    const makeSpec = (type: ProjectCanvasNodeType, key: CanvasNodeSpecKey = type): CanvasNodeSpec => ({
      key,
      type,
      canEdit: type === 'note' || type === 'paper' || type === 'text' || type === 'task' || type === 'group',
      geometry: type === 'group'
        ? { width: 320, height: 190, minWidth: 240, minHeight: 140 }
        : type === 'image'
          ? { width: 300, height: 210, minWidth: 220, minHeight: 150 }
          : type === 'paper_block'
            ? { width: 260, height: 160, minWidth: 180, minHeight: 110 }
            : { ...DEFAULT_GEOMETRY },
      supportsChildren: type === 'group',
      canResize: true,
      acceptsDrop: type === 'group' || type === 'image' || type === 'paper_block',
      inspectorFields: type === 'image' || type === 'paper_block'
        ? ['title', 'reference']
        : type === 'task'
          ? ['title', 'text', 'completed']
          : type === 'group'
            ? ['title']
            : ['title', 'reference', 'text'],
      preview: defaultPreview,
      staleLabel: node => `Stale ${node.type} reference`,
      clipboard: copyNode,
    })
    return [makeSpec('note', 'overview'), ...types.filter(type => type !== 'note').map(type => makeSpec(type)), makeSpec('note')]
  }
}
