import type { CanvasOverlayRect } from '../../canvasOverlayCoordinator'

interface CanvasOverlayLayerProps {
  selectionRect: CanvasOverlayRect | null
}

/** Screen-space overlay layer. Controls remain pixel-sized while the Canvas zooms. */
export function CanvasOverlayLayer({ selectionRect }: CanvasOverlayLayerProps) {
  if (!selectionRect) return null
  return (
    <div
      className="project-canvas-selection-overlay"
      data-testid="project-canvas-selection-overlay"
      aria-hidden="true"
      style={{
        left: selectionRect.left,
        top: selectionRect.top,
        width: selectionRect.width,
        height: selectionRect.height,
      }}
    />
  )
}
