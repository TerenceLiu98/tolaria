import {
  FormattingToolbar,
  getFormattingToolbarItems,
  PositionPopover,
  useBlockNoteEditor,
  useEditorState,
  useExtension,
  useExtensionState,
} from '@blocknote/react'
import type {
  FloatingUIOptions,
  FormattingToolbarProps,
} from '@blocknote/react'
import {
  blockHasType,
  defaultProps,
  type DefaultProps,
} from '@blocknote/core'
import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core'
import { FormattingToolbarExtension } from '@blocknote/core/extensions'
import { useEditorComposing } from './useEditorComposing'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FC,
  type MutableRefObject,
  type ReactElement,
  type SetStateAction,
} from 'react'
import { createPortal } from 'react-dom'
import { MARKDOWN_HIGHLIGHT_STYLE } from '../utils/markdownHighlightMarkdown'
import {
  filterTolariaFormattingToolbarItems,
} from './tolariaEditorFormattingConfig'
import type { AppLocale } from '../lib/i18n'
import { useBlockNoteFormattingToolbarHoverGuard } from './blockNoteFormattingToolbarHoverGuard'
import { BasicTextStyleButton } from './formatting/BasicTextButtons'
import { TolariaBlockTypeSelect } from './formatting/BlockTypeSelect'
import { getFormattingToolbarBridgeBlockId } from './formatting/toolbarBridge'
import {
  InlineAiSuggestionButton,
  type InlineAiSuggestionHandler,
} from './formatting/InlineAiSuggestion'
import { InlineMathButton } from './formatting/InlineMathButton'
import {
  MediaCaptionButton,
  MediaDownloadButton,
  MediaPathCopyButton,
  MediaReplaceButton,
  type MediaReplacementHandler,
} from './formatting/MediaToolbarButtons'
import { SelectedTextContextButton } from './formatting/SelectedTextContextButton'
import {
  getCursorBlockSafely,
} from './formatting/toolbarBlocks'
import { withViewportSafeMiddleware } from './formatting/toolbarPositioning'
import { useEditorFloatingPortal } from './editorFloatingPortal'

type AttachSelectedTextHandler = (text: string) => void

export type { MediaReplacementHandler }
export type { InlineAiSuggestionHandler }

const FORMATTER_CLOSE_GRACE_MS = 160

function isFocusStillWithinToolbar(
  currentTarget: EventTarget & Element,
  nextTarget: EventTarget | null,
) {
  return nextTarget instanceof Node && currentTarget.contains(nextTarget)
}

function clearToolbarCloseGrace(
  timeoutRef: MutableRefObject<number | null>,
  setCloseGraceActive: Dispatch<SetStateAction<boolean>>,
) {
  if (timeoutRef.current !== null) {
    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }
  setCloseGraceActive(false)
}

function startToolbarCloseGrace(
  timeoutRef: MutableRefObject<number | null>,
  setCloseGraceActive: Dispatch<SetStateAction<boolean>>,
) {
  setCloseGraceActive(true)
  if (timeoutRef.current !== null) {
    window.clearTimeout(timeoutRef.current)
  }
  timeoutRef.current = window.setTimeout(() => {
    timeoutRef.current = null
    setCloseGraceActive(false)
  }, FORMATTER_CLOSE_GRACE_MS)
}

function useFormattingToolbarCloseGrace({
  show,
  toolbarHasFocus,
  toolbarHovered,
}: {
  show: boolean
  toolbarHasFocus: boolean
  toolbarHovered: boolean
}) {
  const [closeGraceActive, setCloseGraceActive] = useState(false)
  const closeGraceTimeoutRef = useRef<number | null>(null)
  const previousShowRef = useRef(show)

  const clearCloseGrace = useCallback(() => {
    clearToolbarCloseGrace(closeGraceTimeoutRef, setCloseGraceActive)
  }, [])

  useEffect(() => {
    const toolbarInteractionActive = show || toolbarHasFocus || toolbarHovered

    if (toolbarInteractionActive) {
      clearCloseGrace()
    } else if (previousShowRef.current) {
      startToolbarCloseGrace(closeGraceTimeoutRef, setCloseGraceActive)
    }

    previousShowRef.current = show
  }, [clearCloseGrace, show, toolbarHasFocus, toolbarHovered])

  useEffect(() => () => {
    if (closeGraceTimeoutRef.current !== null) {
      window.clearTimeout(closeGraceTimeoutRef.current)
    }
  }, [])

  return { closeGraceActive, clearCloseGrace }
}

type FormattingToolbarStore = {
  setState(open: boolean): void
}

function useDeduplicatedFormattingToolbarStore(
  store: FormattingToolbarStore,
  show: boolean,
) {
  const openRef = useRef(show)

  useEffect(() => {
    openRef.current = show
  }, [show])

  return useCallback((open: boolean) => {
    if (openRef.current === open) return
    openRef.current = open
    store.setState(open)
  }, [store])
}

function textAlignmentToPlacement(
  textAlignment: DefaultProps['textAlignment'],
) {
  switch (textAlignment) {
    case 'left':
      return 'top-start'
    case 'center':
      return 'top'
    case 'right':
      return 'top-end'
    default:
      return 'top-start'
  }
}

function getFormattingToolbarAnchorElement(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
) {
  const anchor = editor.domElement?.firstElementChild
  return anchor instanceof Element && anchor.isConnected ? anchor : null
}

function replaceToolbarControls(
  items: ReactElement[],
  locale: AppLocale,
  vaultPath?: string,
  onRequestMediaReplacement?: MediaReplacementHandler,
) {
  return items.flatMap((item) => {
    switch (String(item.key)) {
      case 'blockTypeSelect':
        return [<TolariaBlockTypeSelect key={item.key} locale={locale} />]
      case 'fileDownloadButton':
        return [
          <MediaDownloadButton key={item.key} locale={locale} vaultPath={vaultPath} />,
          <MediaReplaceButton
            key="fileReplaceButton"
            locale={locale}
            onRequestMediaReplacement={onRequestMediaReplacement}
            vaultPath={vaultPath}
          />,
          <MediaCaptionButton key="fileCaptionButton" locale={locale} vaultPath={vaultPath} />,
          <MediaPathCopyButton key="filePathCopyButton" locale={locale} vaultPath={vaultPath} />,
        ]
      default:
        return [item]
    }
  })
}

function insertExtraTextStyleButtons(
  items: ReactElement[],
  locale: AppLocale,
  onAttachSelectedTextContext?: AttachSelectedTextHandler,
  onRequestInlineAiSuggestion?: InlineAiSuggestionHandler,
) {
  const strikeButtonIndex = items.findIndex(
    (item) => String(item.key) === 'strikeStyleButton',
  )
  if (strikeButtonIndex === -1) return items

  return [
    ...items.slice(0, strikeButtonIndex + 1),
    <BasicTextStyleButton basicTextStyle="code" key="codeStyleButton" locale={locale} />,
    <BasicTextStyleButton
      basicTextStyle={MARKDOWN_HIGHLIGHT_STYLE}
      key="highlightStyleButton"
      locale={locale}
    />,
    <InlineMathButton
      key="inlineMathButton"
      locale={locale}
    />,
    <SelectedTextContextButton
      key="attachSelectedTextContextButton"
      locale={locale}
      onAttachSelectedTextContext={onAttachSelectedTextContext}
    />,
    <InlineAiSuggestionButton
      key="inlineAiSuggestionButton"
      locale={locale}
      onRequestInlineAiSuggestion={onRequestInlineAiSuggestion}
    />,
    ...items.slice(strikeButtonIndex + 1),
  ]
}

function getTolariaFormattingToolbarItems(
  vaultPath: string | undefined,
  locale: AppLocale,
  onAttachSelectedTextContext?: AttachSelectedTextHandler,
  onRequestInlineAiSuggestion?: InlineAiSuggestionHandler,
  onRequestMediaReplacement?: MediaReplacementHandler,
) {
  return insertExtraTextStyleButtons(
    replaceToolbarControls(
      filterTolariaFormattingToolbarItems(
        getFormattingToolbarItems(),
      ),
      locale,
      vaultPath,
      onRequestMediaReplacement,
    ),
    locale,
    onAttachSelectedTextContext,
    onRequestInlineAiSuggestion,
  )
}

export function TolariaFormattingToolbar({
  locale = 'en',
  onAttachSelectedTextContext,
  onRequestInlineAiSuggestion,
  onRequestMediaReplacement,
  vaultPath,
}: {
  locale?: AppLocale
  onAttachSelectedTextContext?: AttachSelectedTextHandler
  onRequestInlineAiSuggestion?: InlineAiSuggestionHandler
  onRequestMediaReplacement?: MediaReplacementHandler
  vaultPath?: string
} = {}) {
  return (
    <FormattingToolbar>
      {getTolariaFormattingToolbarItems(
        vaultPath,
        locale,
        onAttachSelectedTextContext,
        onRequestInlineAiSuggestion,
        onRequestMediaReplacement,
      )}
    </FormattingToolbar>
  )
}

export function TolariaFormattingToolbarController(props: {
  formattingToolbar?: FC<FormattingToolbarProps>;
  floatingUIOptions?: FloatingUIOptions;
}) {
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >()
  const formattingToolbar = useExtension(FormattingToolbarExtension, {
    editor,
  })
  const show = useExtensionState(FormattingToolbarExtension, {
    editor,
  })
  const isComposing = useEditorComposing(editor)
  const [toolbarHasFocus, setToolbarHasFocus] = useState(false)
  const [toolbarHovered, setToolbarHovered] = useState(false)
  const { closeGraceActive, clearCloseGrace } = useFormattingToolbarCloseGrace({
    show,
    toolbarHasFocus,
    toolbarHovered,
  })
  const setFormattingToolbarOpen = useDeduplicatedFormattingToolbarStore(
    formattingToolbar.store,
    show,
  )

  const isOpen = !isComposing
    && (show || toolbarHasFocus || toolbarHovered || closeGraceActive)
  const hasFloatingToolbarAnchor = getFormattingToolbarAnchorElement(editor) !== null
  const shouldRenderFloatingToolbar = isOpen && hasFloatingToolbarAnchor
  const currentBridgeBlockId = useEditorState({
    editor,
    selector: ({ editor }) => getFormattingToolbarBridgeBlockId(editor),
  })
  const portalElement = useEditorFloatingPortal()

  useBlockNoteFormattingToolbarHoverGuard({
    editor,
    container:
      editor.domElement?.closest('.editor__blocknote-container') ??
      editor.domElement ??
      null,
    selectedFileBlockId: currentBridgeBlockId,
    isOpen,
  })

  const position = useEditorState({
    editor,
    selector: ({ editor }) => (
      shouldRenderFloatingToolbar
        ? {
            from: editor.prosemirrorState.selection.from,
            to: editor.prosemirrorState.selection.to,
          }
        : undefined
    ),
  })

  const placement = useEditorState({
    editor,
    selector: ({ editor }) => {
      const block = getCursorBlockSafely(editor)
      if (!block) return 'top-start'

      if (!blockHasType(block, editor, block.type, {
        textAlignment: defaultProps.textAlignment,
      })) {
        return 'top-start'
      }

      return textAlignmentToPlacement(block.props.textAlignment)
    },
  })

  const floatingUIOptions = useMemo<FloatingUIOptions>(
    () => ({
      ...props.floatingUIOptions,
      useFloatingOptions: {
        open: shouldRenderFloatingToolbar,
        onOpenChange: (open, _event, reason) => {
          setFormattingToolbarOpen(open)
          if (!open) {
            setToolbarHasFocus(false)
            setToolbarHovered(false)
            clearCloseGrace()
          }
          if (reason === 'escape-key') {
            editor.focus()
          }
        },
        placement,
        ...withViewportSafeMiddleware(props.floatingUIOptions?.useFloatingOptions),
      },
      elementProps: {
        style: {
          zIndex: 40,
        },
        ...props.floatingUIOptions?.elementProps,
      },
    }),
    [
      clearCloseGrace,
      editor,
      placement,
      props.floatingUIOptions,
      setFormattingToolbarOpen,
      shouldRenderFloatingToolbar,
    ],
  )

  const Component = props.formattingToolbar || TolariaFormattingToolbar

  const toolbar = (
    <div className="editor__floating-blocknote-scope bn-root bn-mantine bn-default-styles">
      <PositionPopover position={position} {...floatingUIOptions}>
        {shouldRenderFloatingToolbar && (
          <div
            className="pointer-events-auto"
            onPointerEnter={() => {
              setToolbarHovered(true)
            }}
            onPointerLeave={(event) => {
              if (isFocusStillWithinToolbar(event.currentTarget, event.relatedTarget)) {
                return
              }

              setToolbarHovered(false)
            }}
            onFocusCapture={() => {
              setToolbarHasFocus(true)
            }}
            onBlurCapture={(event) => {
              if (isFocusStillWithinToolbar(event.currentTarget, event.relatedTarget)) {
                return
              }

              setToolbarHasFocus(false)
              setFormattingToolbarOpen(false)
            }}
          >
            <Component />
          </div>
        )}
      </PositionPopover>
    </div>
  )

  return portalElement
    ? createPortal(toolbar, portalElement)
    : toolbar
}
