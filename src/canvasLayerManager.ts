import type { ProjectCanvasNode } from './projectCanvas'

export type CanvasLayerKind = 'graphics' | 'document' | 'overlay'

export interface CanvasLayerDescriptor {
  readonly kind: CanvasLayerKind
  readonly zIndex: number
  readonly screenSpace: boolean
}

export interface CanvasRenderBudget {
  readonly maxDomNodesAtLowZoom: number
  readonly maxImagesAtLowZoom: number
  readonly maxDocumentPreviewsAtLowZoom: number
}

export class CanvasLayerManager {
  readonly layers: readonly CanvasLayerDescriptor[] = [
    { kind: 'graphics', zIndex: 0, screenSpace: false },
    { kind: 'document', zIndex: 1, screenSpace: false },
    { kind: 'overlay', zIndex: 10, screenSpace: true },
  ]

  readonly budget: CanvasRenderBudget = {
    maxDomNodesAtLowZoom: 72,
    maxImagesAtLowZoom: 16,
    maxDocumentPreviewsAtLowZoom: 40,
  }

  get(kind: CanvasLayerKind): CanvasLayerDescriptor {
    return this.layers.find(layer => layer.kind === kind) ?? this.layers[0]
  }

  shouldRenderDom(zoom: number, rank: number): boolean {
    return zoom >= 0.65 || rank < this.budget.maxDomNodesAtLowZoom
  }

  shouldRenderNode(node: ProjectCanvasNode, zoom: number, rank: number, retained: ReadonlySet<string>): boolean {
    if (retained.has(node.id) || zoom >= 0.65) return true
    if (node.type === 'image') return rank < this.budget.maxImagesAtLowZoom
    if (node.type === 'note' || node.type === 'paper' || node.type === 'paper_block') {
      return rank < this.budget.maxDocumentPreviewsAtLowZoom
    }
    return rank < this.budget.maxDomNodesAtLowZoom
  }

  filterNodes(nodes: readonly ProjectCanvasNode[], zoom: number, retained: ReadonlySet<string>): ProjectCanvasNode[] {
    return nodes.filter((node, rank) => this.shouldRenderNode(node, zoom, rank, retained))
  }
}
