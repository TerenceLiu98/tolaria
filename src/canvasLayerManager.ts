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
    maxDomNodesAtLowZoom: 180,
    maxImagesAtLowZoom: 24,
    maxDocumentPreviewsAtLowZoom: 80,
  }

  get(kind: CanvasLayerKind): CanvasLayerDescriptor {
    return this.layers.find(layer => layer.kind === kind) ?? this.layers[0]
  }

  shouldRenderDom(zoom: number, rank: number): boolean {
    return zoom >= 0.65 || rank < this.budget.maxDomNodesAtLowZoom
  }
}
