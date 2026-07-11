import { useCallback, useState } from 'react'
import type { ProjectCanvasNode } from '../../projectCanvas'

interface UseProjectCanvasFocusModeOptions {
  node: ProjectCanvasNode | null
  canFocus: (node: ProjectCanvasNode) => boolean
  onChange?: (node: ProjectCanvasNode, enabled: boolean) => void
}

export function useProjectCanvasFocusMode({ canFocus, node, onChange }: UseProjectCanvasFocusModeOptions) {
  const [focusMode, setFocusMode] = useState(false)
  const [editorHost, setEditorHost] = useState<HTMLElement | null>(null)

  const changeFocusMode = useCallback((enabled: boolean) => {
    if (!node || !canFocus(node)) return
    setEditorHost(null)
    setFocusMode(enabled)
    onChange?.(node, enabled)
  }, [canFocus, node, onChange])

  const exitFocusMode = useCallback(() => {
    if (focusMode) changeFocusMode(false)
  }, [changeFocusMode, focusMode])

  return {
    changeFocusMode,
    editorHost,
    exitFocusMode,
    focusMode,
    setEditorHost,
  }
}
