import type { CanvasOverlayGuide, CanvasOverlayHandle, CanvasOverlayKind, CanvasOverlayRect } from '../../canvasOverlayCoordinator'
import type { CanvasPoint } from '../../canvasSceneStore'
import type { CanvasGestureEndpoint } from '../../canvasToolManager'
import { LinkSimple, Resize } from '@phosphor-icons/react'
import { Button } from '../ui/button'
import type { CanvasNodeToolbarAction } from '../../canvasNodeSpecRegistry'
import type { AppLocale } from '../../lib/i18n'
import { CanvasContextualToolbar } from './CanvasContextualToolbar'

interface CanvasOverlayLayerProps {
  selectionRect: CanvasOverlayRect | null
  handles: readonly CanvasOverlayHandle[]
  connectionHandles: readonly CanvasOverlayHandle[]
  edgeEndpointHandles: readonly CanvasOverlayHandle[]
  connectLabel: (nodeId: string) => string
  onConnectStart: (nodeId: string, point: CanvasPoint) => void
  onReconnectStart: (edgeId: string, endpoint: CanvasGestureEndpoint, point: CanvasPoint, pointerId?: number) => void
  onResizeStart: (nodeId: string, point: CanvasPoint) => void
  reconnectLabel: (edgeId: string, endpoint: CanvasGestureEndpoint) => string
  resizeLabel: (nodeId: string) => string
  snapGuides?: readonly CanvasOverlayGuide[]
  toolbarRect?: CanvasOverlayRect | null
  toolbarActions?: readonly CanvasNodeToolbarAction[]
  toolbarTitle?: string
  locale: AppLocale
  onToolbarAction?: (action: CanvasNodeToolbarAction) => void
  zIndices: Readonly<Record<CanvasOverlayKind, number>>
}

function overlayHandleKey(handle: CanvasOverlayHandle): string {
  return handle.kind === 'reconnect'
    ? `${handle.kind}-${handle.edgeId}-${handle.endpoint}`
    : `${handle.kind}-${handle.nodeId}`
}

function overlayHandleLabel(
  handle: CanvasOverlayHandle,
  labels: Pick<CanvasOverlayLayerProps, 'connectLabel' | 'reconnectLabel' | 'resizeLabel'>,
): string {
  if (handle.kind === 'reconnect') return labels.reconnectLabel(handle.edgeId, handle.endpoint)
  return handle.kind === 'connect' ? labels.connectLabel(handle.nodeId) : labels.resizeLabel(handle.nodeId)
}

/** Screen-space overlay layer. Controls remain pixel-sized while the Canvas zooms. */
export function CanvasOverlayLayer({
  connectionHandles,
  connectLabel,
  edgeEndpointHandles,
  handles,
  locale,
  onConnectStart,
  onReconnectStart,
  onResizeStart,
  onToolbarAction,
  reconnectLabel,
  resizeLabel,
  selectionRect,
  snapGuides = [],
  toolbarActions = [],
  toolbarRect = null,
  toolbarTitle = '',
  zIndices,
}: CanvasOverlayLayerProps) {
  if (!selectionRect && handles.length === 0 && connectionHandles.length === 0 && edgeEndpointHandles.length === 0 && snapGuides.length === 0 && !toolbarRect) return null
  return (
    <div className="project-canvas-overlay-layer">
      {snapGuides.map((guide, index) => (
        <div
          key={`${guide.orientation}-${guide.position}-${index}`}
          className={`project-canvas-snap-guide project-canvas-snap-guide--${guide.orientation}`}
          data-testid="project-canvas-snap-guide"
          style={guide.orientation === 'vertical'
            ? { left: guide.position, zIndex: zIndices.snap }
            : { top: guide.position, zIndex: zIndices.snap }}
        />
      ))}
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
            zIndex: zIndices.selection,
          }}
        />
      ) : null}
      {toolbarRect ? (
        <div
          className="project-canvas-contextual-toolbar"
          data-testid="project-canvas-contextual-toolbar"
          style={{ left: toolbarRect.left, top: toolbarRect.top, width: toolbarRect.width, height: toolbarRect.height, zIndex: zIndices.toolbar }}
        >
          <CanvasContextualToolbar actions={toolbarActions} locale={locale} title={toolbarTitle} onAction={action => onToolbarAction?.(action)} />
        </div>
      ) : null}
      {[...connectionHandles, ...edgeEndpointHandles, ...handles].map(handle => (
        <Button
          key={overlayHandleKey(handle)}
          type="button"
          size="icon-xs"
          variant="secondary"
          className={`project-canvas-overlay-handle project-canvas-overlay-handle--${handle.kind}`}
          data-node-id={handle.kind === 'reconnect' ? undefined : handle.nodeId}
          data-edge-id={handle.kind === 'reconnect' ? handle.edgeId : undefined}
          data-testid={`project-canvas-${handle.kind}-handle`}
          aria-label={overlayHandleLabel(handle, { connectLabel, reconnectLabel, resizeLabel })}
          style={{
            left: handle.left,
            top: handle.top,
            zIndex: zIndices[handle.kind === 'connect' || handle.kind === 'reconnect' ? 'connection' : 'resize'],
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
            if (handle.kind === 'reconnect') onReconnectStart(handle.edgeId, handle.endpoint, { x: event.clientX, y: event.clientY }, event.pointerId)
            else if (handle.kind === 'connect') onConnectStart(handle.nodeId, { x: event.clientX, y: event.clientY })
            else onResizeStart(handle.nodeId, { x: event.clientX, y: event.clientY })
          }}
          onClick={event => event.stopPropagation()}
        >
          {handle.kind === 'connect' || handle.kind === 'reconnect' ? <LinkSimple size={11} /> : <Resize size={11} />}
        </Button>
      ))}
    </div>
  )
}
