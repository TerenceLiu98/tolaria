import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { CommentGutter } from './CommentUI'
import type { EditorCommentOptions } from './commentAnchors'
import { commentTargetsForBlocks, type EditorCommentTarget } from './commentTargets'
import {
  blockElementById,
  editorBlockElement,
  type TolariaBlockNoteEditor,
} from '../tolariaBlockNoteDom'

interface EditorCommentPosition {
  anchorId: string
  blockId: string
  top: number
}

interface EditorCommentGutterLayerProps {
  commentOptions?: EditorCommentOptions
  containerRef: RefObject<HTMLElement | null>
  editor: TolariaBlockNoteEditor
  portalElement: HTMLElement | null
}

const COMMENT_GUTTER_RIGHT_OFFSET = 10
const COMMENT_THREAD_WIDTH = 352
const COMMENT_THREAD_GAP = 8

function equalCommentPositions(left: readonly EditorCommentPosition[], right: readonly EditorCommentPosition[]): boolean {
  return left.length === right.length && left.every((position, index) => {
    const other = right[index]
    return other
      && position.anchorId === other.anchorId
      && position.blockId === other.blockId
      && position.top === other.top
  })
}

function measureCommentPositions({
  container,
  editor,
  targets,
}: {
  container: HTMLElement
  editor: TolariaBlockNoteEditor
  targets: readonly EditorCommentTarget[]
}): EditorCommentPosition[] {
  const editorElement = editorBlockElement(editor) ?? container
  const containerRect = container.getBoundingClientRect()

  return targets.flatMap(({ anchor, blockId }) => {
    const blockElement = blockElementById(editorElement, blockId) ?? blockElementById(container, blockId)
    if (!blockElement) return []

    const blockRect = blockElement.getBoundingClientRect()
    if (blockRect.width <= 0 || blockRect.height <= 0) return []

    return [{
      anchorId: anchor.id,
      blockId,
      top: Math.max(0, blockRect.top - containerRect.top),
    }]
  })
}

function selectedThreadStyle({
  position,
  portalElement,
}: {
  position: EditorCommentPosition
  portalElement: HTMLElement | null
}) {
  if (!portalElement) return { right: 44, top: position.top }

  const portalWidth = portalElement.getBoundingClientRect().width
  const right = COMMENT_GUTTER_RIGHT_OFFSET + 32 + COMMENT_THREAD_GAP
  const maxWidth = Math.max(220, portalWidth - right - COMMENT_THREAD_GAP)
  return {
    right,
    top: position.top,
    width: Math.min(COMMENT_THREAD_WIDTH, maxWidth),
  }
}

export function EditorCommentGutterLayer({
  commentOptions,
  containerRef,
  editor,
  portalElement,
}: EditorCommentGutterLayerProps) {
  const [positions, setPositions] = useState<EditorCommentPosition[]>([])
  const positionFrameRef = useRef<number | null>(null)
  const updatePositions = useCallback(() => {
    const container = containerRef.current
    if (!commentOptions || !container) {
      setPositions([])
      return
    }

    const targets = commentTargetsForBlocks({
      anchors: commentOptions.anchors,
      editorBlocks: editor.document,
      selectedAnchorId: commentOptions.selectedAnchorId,
    })
    const nextPositions = measureCommentPositions({ container, editor, targets })
    setPositions((currentPositions) => (
      equalCommentPositions(currentPositions, nextPositions) ? currentPositions : nextPositions
    ))
  }, [commentOptions, containerRef, editor])

  const scheduleUpdatePositions = useCallback(() => {
    const ownerWindow = containerRef.current?.ownerDocument.defaultView
    if (!ownerWindow || positionFrameRef.current !== null) return

    positionFrameRef.current = ownerWindow.requestAnimationFrame(() => {
      positionFrameRef.current = null
      updatePositions()
    })
  }, [containerRef, updatePositions])

  useLayoutEffect(() => {
    const ownerWindow = containerRef.current?.ownerDocument.defaultView
    if (!ownerWindow) return undefined

    scheduleUpdatePositions()
    ownerWindow.addEventListener('resize', scheduleUpdatePositions)
    ownerWindow.addEventListener('scroll', scheduleUpdatePositions, true)
    return () => {
      if (positionFrameRef.current !== null) {
        ownerWindow.cancelAnimationFrame(positionFrameRef.current)
        positionFrameRef.current = null
      }
      ownerWindow.removeEventListener('resize', scheduleUpdatePositions)
      ownerWindow.removeEventListener('scroll', scheduleUpdatePositions, true)
    }
  }, [containerRef, portalElement, scheduleUpdatePositions])

  if (!commentOptions || positions.length === 0) return null

  const anchorById = new Map(commentOptions.anchors.map((anchor) => [anchor.id, anchor]))
  const selectedPosition = positions.find((position) => position.anchorId === commentOptions.selectedAnchorId)
  const selectedThread = selectedPosition && commentOptions.selectedAnchorId ? (
    <div
      className="pointer-events-auto absolute z-50 max-w-[min(22rem,calc(100vw-5rem))]"
      data-testid={`editor-comment-thread-layer-${commentOptions.selectedAnchorId}`}
      style={selectedThreadStyle({ position: selectedPosition, portalElement })}
    >
      {commentOptions.renderThread(commentOptions.selectedAnchorId)}
    </div>
  ) : null

  const layer = (
    <div
      aria-hidden={false}
      className="pointer-events-none absolute inset-0 z-40"
      data-testid="editor-comment-gutter-layer"
    >
      {positions.map((position) => {
        const anchor = anchorById.get(position.anchorId)
        if (!anchor) return null
        return (
          <div
            key={position.anchorId}
            className="pointer-events-auto absolute"
            data-comment-anchor-id={position.anchorId}
            data-testid={`editor-comment-gutter-anchor-${position.anchorId}`}
            style={{
              right: COMMENT_GUTTER_RIGHT_OFFSET,
              top: position.top,
            }}
          >
            <CommentGutter
              anchorId={anchor.id}
              count={anchor.comments.length}
              isOpen={commentOptions.selectedAnchorId === anchor.id}
              onToggleThread={commentOptions.onToggleThread}
              title={anchor.title}
            />
          </div>
        )
      })}
      {selectedThread}
    </div>
  )

  return portalElement ? createPortal(layer, portalElement) : layer
}
