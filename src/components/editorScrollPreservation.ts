export type EditorScrollSnapshot = {
  scrollArea: HTMLElement
  scrollLeft: number
  scrollTop: number
}

const BLOCKNOTE_EDITOR_SELECTOR = '.bn-editor'
const EDITOR_BLOCKNOTE_CONTAINER_SELECTOR = '.editor__blocknote-container'
const EDITOR_SCROLL_AREA_SELECTOR = '.editor-scroll-area'
const SHEET_SCROLL_AREA_CLASS = 'editor-scroll-area--sheet'

const SCROLL_RESTORE_DELAY_MS = [0, 32, 96, 192] as const

export function editorElementFromControl(control: Element): HTMLElement | undefined {
  const container = control.closest(EDITOR_BLOCKNOTE_CONTAINER_SELECTOR)
  const editorElement = container?.querySelector(BLOCKNOTE_EDITOR_SELECTOR)
  if (editorElement instanceof HTMLElement) return editorElement

  const documentEditors = Array.from(control.ownerDocument.querySelectorAll(BLOCKNOTE_EDITOR_SELECTOR))
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
  return documentEditors.find((element) => {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }) ?? documentEditors.at(-1)
}

function visibleRichEditorScrollArea(ownerDocument: Document): HTMLElement | null {
  const scrollAreas = Array.from(ownerDocument.querySelectorAll(EDITOR_SCROLL_AREA_SELECTOR))
    .filter((element): element is HTMLElement => element instanceof HTMLElement)

  return scrollAreas.find((scrollArea) => {
    if (scrollArea.classList.contains(SHEET_SCROLL_AREA_CLASS)) return false
    if (!scrollArea.querySelector(`${EDITOR_BLOCKNOTE_CONTAINER_SELECTOR} ${BLOCKNOTE_EDITOR_SELECTOR}`)) return false

    const rect = scrollArea.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }) ?? null
}

function scrollAreaFromControl(control: Element): HTMLElement | null {
  const directScrollArea = control.closest(EDITOR_SCROLL_AREA_SELECTOR)
  if (directScrollArea instanceof HTMLElement) return directScrollArea

  const editorElement = editorElementFromControl(control)
  const editorScrollArea = editorElement?.closest(EDITOR_SCROLL_AREA_SELECTOR)
  return editorScrollArea instanceof HTMLElement
    ? editorScrollArea
    : visibleRichEditorScrollArea(control.ownerDocument)
}

export function captureEditorScrollForControl(control: Element): EditorScrollSnapshot | null {
  const scrollArea = scrollAreaFromControl(control)
  return scrollArea
    ? {
        scrollArea,
        scrollLeft: scrollArea.scrollLeft,
        scrollTop: scrollArea.scrollTop,
      }
    : null
}

export function restoreEditorScroll(snapshot: EditorScrollSnapshot | null) {
  if (!snapshot?.scrollArea.isConnected) return
  snapshot.scrollArea.scrollLeft = snapshot.scrollLeft
  snapshot.scrollArea.scrollTop = snapshot.scrollTop
}

function schedulePostMutationScrollRestores(snapshot: EditorScrollSnapshot, ownerWindow: Window) {
  for (const delay of SCROLL_RESTORE_DELAY_MS) {
    ownerWindow.setTimeout(() => restoreEditorScroll(snapshot), delay)
  }

  ownerWindow.requestAnimationFrame(() => {
    restoreEditorScroll(snapshot)
    ownerWindow.requestAnimationFrame(() => restoreEditorScroll(snapshot))
  })
}

export function scheduleEditorScrollRestore(snapshot: EditorScrollSnapshot | null) {
  restoreEditorScroll(snapshot)
  queueMicrotask(() => restoreEditorScroll(snapshot))

  const ownerWindow = snapshot?.scrollArea.ownerDocument.defaultView
  if (!ownerWindow) return

  schedulePostMutationScrollRestores(snapshot, ownerWindow)
}
