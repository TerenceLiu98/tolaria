import type { CanvasOverlayHandle, CanvasOverlayRect } from '../../canvasOverlayCoordinator'
import type { CanvasPoint } from '../../canvasSceneStore'
import { LinkSimple, Resize } from '@phosphor-icons/react'
import { Button } from '../ui/button'

interface CanvasOverlayLayerProps {
  selectionRect: CanvasOverlayRect | null
  handles: readonly CanvasOverlayHandle[]
  connectionHandles: readonly CanvasOverlayHandle[]
  connectLabel: (nodeId: string) => string
  onConnectStart: (nodeId: string, point: CanvasPoint) => void
  onResizeStart: (nodeId: string, point: CanvasPoint) => void
  resizeLabel: (nodeId: string) => string
}

/** Screen-space overlay layer. Controls remain pixel-sized while the Canvas zooms. */
export function CanvasOverlayLayer({ connectionHandles, connectLabel, handles, onConnectStart, onResizeStart, resizeLabel, selectionRect }: CanvasOverlayLayerProps) {
  if (!selectionRect && handles.length === 0 && connectionHandles.length === 0) return null
  return (
    <div className="project-canvas-overlay-layer">
      {selectionRect ? (
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
      ) : null}
      {[...connectionHandles, ...handles].map(handle => (
        <Button
          key={`${handle.kind}-${handle.nodeId}`}
          type="button"
          size="icon-xs"
          variant="secondary"
          className={`project-canvas-overlay-handle project-canvas-overlay-handle--${handle.kind}`}
          data-node-id={handle.nodeId}
          data-testid={`project-canvas-${handle.kind}-handle`}
          aria-label={handle.kind === 'connect' ? connectLabel(handle.nodeId) : resizeLabel(handle.nodeId)}
          style={{ left: handle.left, top: handle.top }}
          onPointerDown={(event) => {
            event.stopPropagation()
            if (handle.kind === 'connect') onConnectStart(handle.nodeId, { x: event.clientX, y: event.clientY })
            else onResizeStart(handle.nodeId, { x: event.clientX, y: event.clientY })
          }}
          onClick={event => event.stopPropagation()}
        >
          {handle.kind === 'connect' ? <LinkSimple size={11} /> : <Resize size={11} />}
        </Button>
      ))}
    </div>
  )
}
