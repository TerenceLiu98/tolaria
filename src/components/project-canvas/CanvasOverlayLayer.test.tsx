import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CanvasOverlayLayer } from './CanvasOverlayLayer'

describe('CanvasOverlayLayer', () => {
  it('routes selected connector endpoint handles as screen-space reconnect gestures', () => {
    const onReconnectStart = vi.fn()
    render(
      <CanvasOverlayLayer
        connectionHandles={[]}
        connectLabel={nodeId => `Connect from ${nodeId}`}
        edgeEndpointHandles={[
          { kind: 'reconnect', edgeId: 'edge-1', endpoint: 'from', left: 100, top: 80 },
          { kind: 'reconnect', edgeId: 'edge-1', endpoint: 'to', left: 300, top: 80 },
        ]}
        handles={[]}
        locale="en"
        onConnectStart={vi.fn()}
        onReconnectStart={onReconnectStart}
        onResizeStart={vi.fn()}
        onToolbarAction={vi.fn()}
        reconnectLabel={(edgeId, endpoint) => `Reconnect ${edgeId} ${endpoint}`}
        resizeLabel={nodeId => `Resize ${nodeId}`}
        selectionRect={null}
        zIndices={{ selection: 100, snap: 101, resize: 102, connection: 103, toolbar: 104, comment: 105, menu: 106 }}
      />,
    )

    const handles = screen.getAllByTestId('project-canvas-reconnect-handle')
    expect(handles).toHaveLength(2)
    expect(handles[0]).toHaveStyle({ left: '100px', top: '80px' })
    fireEvent.pointerDown(handles[1], { clientX: 300, clientY: 80, pointerId: 4 })
    expect(onReconnectStart).toHaveBeenCalledWith('edge-1', 'to', { x: 300, y: 80 }, 4)
  })
})
