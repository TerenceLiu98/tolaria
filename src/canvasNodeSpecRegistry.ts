import type { ProjectCanvasNode, ProjectCanvasNodeType } from './projectCanvas'

export type CanvasNodePresentation = 'overview' | 'preview' | 'edit'

export interface CanvasNodeGeometry {
  width: number
  height: number
  minWidth: number
  minHeight: number
}

export interface CanvasNodeSpec {
  readonly type: ProjectCanvasNodeType
  readonly canEdit: boolean
  readonly geometry: CanvasNodeGeometry
  readonly supportsChildren: boolean
  readonly preview: (node: ProjectCanvasNode, presentation: CanvasNodePresentation) => { title: string; text?: string }
  readonly staleLabel: (node: ProjectCanvasNode) => string
}

const DEFAULT_GEOMETRY: CanvasNodeGeometry = { width: 260, height: 150, minWidth: 180, minHeight: 110 }

function defaultPreview(node: ProjectCanvasNode): { title: string; text?: string } {
  return { title: node.title ?? node.ref ?? 'Untitled node', text: node.text }
}

export class CanvasNodeSpecRegistry {
  private readonly specs = new Map<ProjectCanvasNodeType, CanvasNodeSpec>()

  constructor(specs: readonly CanvasNodeSpec[] = CanvasNodeSpecRegistry.defaults()) {
    for (const spec of specs) this.register(spec)
  }

  register(spec: CanvasNodeSpec): void {
    this.specs.set(spec.type, spec)
  }

  get(type: ProjectCanvasNodeType): CanvasNodeSpec {
    return this.specs.get(type) ?? CanvasNodeSpecRegistry.defaults().find(spec => spec.type === 'text')!
  }

  has(type: ProjectCanvasNodeType): boolean {
    return this.specs.has(type)
  }

  static defaults(): CanvasNodeSpec[] {
    const types: ProjectCanvasNodeType[] = ['note', 'paper', 'paper_block', 'image', 'text', 'task', 'group']
    return types.map(type => ({
      type,
      canEdit: type === 'note' || type === 'paper' || type === 'text' || type === 'task' || type === 'group',
      geometry: type === 'group'
        ? { width: 320, height: 190, minWidth: 240, minHeight: 140 }
        : { ...DEFAULT_GEOMETRY },
      supportsChildren: type === 'group',
      preview: defaultPreview,
      staleLabel: node => `Stale ${node.type} reference`,
    }))
  }
}
