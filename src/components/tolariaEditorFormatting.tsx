import {
  FormattingToolbar,
  getFormattingToolbarItems,
  PositionPopover,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
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
  editorHasBlockWithType,
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
  type FormEvent,
  type MutableRefObject,
  type ReactElement,
  type SetStateAction,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Button as MantineButton,
  CheckIcon as MantineCheckIcon,
  Menu as MantineMenu,
} from '@mantine/core'
import {
  ArrowSquareOut as ExternalLink,
  CaretDown as ChevronDown,
  ClipboardText,
  Code as Code2,
  Function as FunctionIcon,
  Highlighter,
  Paperclip,
  TextB as Bold,
  TextItalic as Italic,
  TextStrikethrough as Strikethrough,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { MARKDOWN_HIGHLIGHT_STYLE } from '../utils/markdownHighlightMarkdown'
import { MATH_INLINE_TYPE } from '../utils/mathMarkdown'
import {
  filterTolariaFormattingToolbarItems,
  getTolariaBlockTypeSelectItems,
} from './tolariaEditorFormattingConfig'
import { translate, type AppLocale } from '../lib/i18n'
import { useBlockNoteFormattingToolbarHoverGuard } from './blockNoteFormattingToolbarHoverGuard'
import { openEditorAttachmentOrUrl } from './editorAttachmentActions'
import { writeClipboardText } from '../utils/clipboardText'
import { portableAttachmentPathFromCurrentVaultAssetUrl } from '../utils/vaultAttachments'
import {
  isStaleBlockReferenceError,
  reportRecoveredEditorTransformError,
} from './richEditorTransformErrorRecoveryExtension'
import { useEditorFloatingPortal } from './editorFloatingPortal'

type TolariaBasicTextStyle =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | typeof MARKDOWN_HIGHLIGHT_STYLE

type AttachSelectedTextHandler = (text: string) => void
export interface InlineAiSuggestionRequest {
  blockId?: string
  operation: 'rewrite'
  selectedText: string
}

export interface InlineAiSuggestionCallbacks {
  onDelta: (text: string) => void
  onDone: () => void
  onError: (message: string) => void
}

export type InlineAiSuggestionHandler = (
  request: InlineAiSuggestionRequest,
  callbacks: InlineAiSuggestionCallbacks,
) => void | Promise<void>

export interface MediaReplacementRequest {
  blockId: string
  caption: string
  displayPath: string
  type: string
  url: string
}

export interface MediaReplacementResult {
  name?: string
  url: string
}

export type MediaReplacementHandler = (
  request: MediaReplacementRequest,
) => MediaReplacementResult | null | Promise<MediaReplacementResult | null>

type InlineMathContent = {
  content?: undefined
  props: { latex: string }
  type: typeof MATH_INLINE_TYPE
}

type InlineAiSuggestionTarget =
  | { kind: 'selection' }
  | { blockId: string; kind: 'block' }

const FORMATTER_CLOSE_GRACE_MS = 160
const FORMATTER_VIEWPORT_PADDING_PX = 8
type TolariaFloatingOptions = NonNullable<FloatingUIOptions['useFloatingOptions']>
type TolariaFloatingMiddleware = NonNullable<TolariaFloatingOptions['middleware']>[number]

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

const TOLARIA_BASIC_TEXT_STYLE_TOOLTIPS = {
  bold: {
    label: 'Bold',
    mainTooltip: 'Bold (persists in markdown)',
    secondaryTooltip: '**strong**',
  },
  italic: {
    label: 'Italic',
    mainTooltip: 'Italic (persists in markdown)',
    secondaryTooltip: '*emphasis*',
  },
  strike: {
    label: 'Strikethrough',
    mainTooltip: 'Strikethrough (persists in markdown)',
    secondaryTooltip: '~~strike~~',
  },
  code: {
    label: 'Inline code',
    mainTooltip: 'Inline code (persists in markdown)',
    secondaryTooltip: '`code`',
  },
} satisfies Record<
  Exclude<TolariaBasicTextStyle, typeof MARKDOWN_HIGHLIGHT_STYLE>,
  { label: string; mainTooltip: string; secondaryTooltip: string }
>

const TOLARIA_BASIC_TEXT_STYLE_ICONS = {
  bold: Bold,
  italic: Italic,
  strike: Strikethrough,
  code: Code2,
  [MARKDOWN_HIGHLIGHT_STYLE]: Highlighter,
} satisfies Record<TolariaBasicTextStyle, PhosphorIcon>

type TolariaSelectedBlock = ReturnType<
  BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>['getTextCursorPosition']
>['block']

type TolariaSelectedFileBlock = {
  caption: string
  displayPath: string
  id: string
  type: string
  url: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTolariaSelectedBlock(value: unknown): value is TolariaSelectedBlock {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.type === 'string'
    && isRecord(value.props)
}

function tolariaSelectedBlocks(value: unknown): TolariaSelectedBlock[] {
  return Array.isArray(value) ? value.filter(isTolariaSelectedBlock) : []
}

const FORMATTING_TOOLBAR_FILE_BLOCK_TYPES = new Set([
  'audio',
  'file',
  'image',
  'video',
])

type TolariaBlockTypeSelectOption = ReturnType<
  typeof getTolariaBlockTypeSelectItems
>[number] & {
  iconElement: ReactElement
  isSelected: boolean
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

function viewportClampMiddleware(): TolariaFloatingMiddleware {
  return {
    name: 'tolariaViewportClamp',
    fn({ x, rects }: { rects: { floating: { width: number } }; x: number }) {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth
      const minX = FORMATTER_VIEWPORT_PADDING_PX
      const maxX = Math.max(
        minX,
        viewportWidth - rects.floating.width - FORMATTER_VIEWPORT_PADDING_PX,
      )

      return {
        x: Math.min(Math.max(x, minX), maxX),
      }
    },
  }
}

function withViewportSafeMiddleware(
  options?: TolariaFloatingOptions,
): TolariaFloatingOptions {
  if (!options) {
    return {
      middleware: [viewportClampMiddleware()],
    }
  }

  return {
    ...options,
    middleware: [
      ...(options.middleware ?? []),
      viewportClampMiddleware(),
    ],
  }
}

function editorSupportsTextStyle(
  style: TolariaBasicTextStyle,
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
) {
  const styleSchema = Reflect.get(editor.schema.styleSchema, style) as {
    type?: string
    propSchema?: unknown
  } | undefined
  return (
    style in editor.schema.styleSchema &&
    styleSchema?.type === style &&
    styleSchema.propSchema === 'boolean'
  )
}

function getSelectedBlocksSafely(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
): TolariaSelectedBlock[] {
  try {
    const selectionBlocks = tolariaSelectedBlocks(editor.getSelection()?.blocks)
    if (selectionBlocks.length) return selectionBlocks
  } catch {
    // BlockNote can briefly expose an invalid selection while inline actions remount blocks.
  }

  try {
    const block = editor.getTextCursorPosition().block
    return isTolariaSelectedBlock(block) ? [block] : []
  } catch {
    return []
  }
}

function getCursorBlockSafely(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
): TolariaSelectedBlock | null {
  try {
    const block = editor.getTextCursorPosition().block
    return isTolariaSelectedBlock(block) ? block : null
  } catch {
    return null
  }
}

function selectionSupportsInlineFormatting(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
) {
  return getSelectedBlocksSafely(editor).some((block) => block.content !== undefined)
}

function getBasicTextStyleButtonState(
  basicTextStyle: TolariaBasicTextStyle,
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
) {
  if (!editor.isEditable) return undefined
  if (!editorSupportsTextStyle(basicTextStyle, editor)) return undefined
  if (!selectionSupportsInlineFormatting(editor)) return undefined

  return {
    active: basicTextStyle in editor.getActiveStyles(),
  }
}

function getBlockTypeItemIconElement(
  item: ReturnType<typeof getTolariaBlockTypeSelectItems>[number],
) {
  const Icon = item.icon
  return <Icon size={16} />
}

function isSelectedBlockTypeItem(
  item: ReturnType<typeof getTolariaBlockTypeSelectItems>[number],
  firstSelectedBlock: TolariaSelectedBlock,
) {
  if (item.type !== firstSelectedBlock.type) return false

  return Object.entries(item.props || {}).every(
    ([propName, propValue]) =>
      propValue === Reflect.get(firstSelectedBlock.props, propName),
  )
}

function getTolariaBlockTypeSelectOptions(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
  firstSelectedBlock: TolariaSelectedBlock,
) {
  return getTolariaBlockTypeSelectItems()
    .filter((item) =>
      editorHasBlockWithType(
        editor,
        item.type,
        Object.fromEntries(
          Object.entries(item.props || {}).map(([propName, propValue]) => [
            propName,
            typeof propValue,
          ]),
        ) as Record<string, 'string' | 'number' | 'boolean'>,
      ),
    )
    .map((item) => ({
      ...item,
      iconElement: getBlockTypeItemIconElement(item),
      isSelected: isSelectedBlockTypeItem(item, firstSelectedBlock),
    }))
}

function getFormattingToolbarBridgeBlockId(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
) {
  const selectedBlock = getSelectedBlocksSafely(editor).at(0)
  if (!selectedBlock) return null

  return FORMATTING_TOOLBAR_FILE_BLOCK_TYPES.has(selectedBlock.type)
    ? selectedBlock.id
    : null
}

function getSelectedFileBlockState(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
  vaultPath?: string,
): TolariaSelectedFileBlock | null {
  const selectedBlocks = getSelectedBlocksSafely(editor)
  if (selectedBlocks.length !== 1) return null

  const block = selectedBlocks.at(0)
  if (!block) return null
  if (!FORMATTING_TOOLBAR_FILE_BLOCK_TYPES.has(block.type)) return null

  const url = (block.props as Record<string, unknown>).url
  if (typeof url !== 'string' || url.trim().length === 0) return null

  return {
    caption: typeof block.props.caption === 'string' ? block.props.caption : '',
    displayPath: vaultPath
      ? portableAttachmentPathFromCurrentVaultAssetUrl({ url, vaultPath }) ?? url
      : url,
    id: block.id,
    type: block.type,
    url,
  }
}

function reportStaleFormattingToolbarBlockReference(error: unknown) {
  reportRecoveredEditorTransformError('stale_block_reference', error)
}

function liveSelectedBlock(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
  block: TolariaSelectedBlock,
) {
  try {
    return editor.getBlock(block.id) as TolariaSelectedBlock | undefined
  } catch (error) {
    if (isStaleBlockReferenceError(error)) {
      reportStaleFormattingToolbarBlockReference(error)
      return undefined
    }
    throw error
  }
}

function liveSelectedBlocks(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
  selectedBlocks: TolariaSelectedBlock[],
) {
  const liveBlocks: TolariaSelectedBlock[] = []

  for (const block of selectedBlocks) {
    const liveBlock = liveSelectedBlock(editor, block)
    if (!liveBlock) return []
    liveBlocks.push(liveBlock)
  }

  return liveBlocks
}

function fileDownloadTooltip(dict: unknown, blockType: string): string {
  const tooltip = (dict as {
    formatting_toolbar?: {
      file_download?: {
        tooltip?: Record<string, string>
      }
    }
  }).formatting_toolbar?.file_download?.tooltip

  return (tooltip ? Reflect.get(tooltip, blockType) as string | undefined : undefined) ?? tooltip?.file ?? 'Download file'
}

function getFormattingToolbarAnchorElement(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
) {
  const anchor = editor.domElement?.firstElementChild
  return anchor instanceof Element && anchor.isConnected ? anchor : null
}

function updateSelectedBlocksToType(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
  selectedBlocks: TolariaSelectedBlock[],
  item: ReturnType<typeof getTolariaBlockTypeSelectItems>[number],
) {
  const blocks = liveSelectedBlocks(editor, selectedBlocks)
  if (!blocks.length) return

  try {
    editor.focus()
    editor.transact(() => {
      for (const block of blocks) {
        editor.updateBlock(block.id, {
          type: item.type as never,
          props: item.props as never,
        })
      }
    })
  } catch (error) {
    if (isStaleBlockReferenceError(error)) {
      reportStaleFormattingToolbarBlockReference(error)
      return
    }
    throw error
  }
}

function TolariaBasicTextStyleButton({
  basicTextStyle,
  locale = 'en',
}: {
  basicTextStyle: TolariaBasicTextStyle
  locale?: AppLocale
}) {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >()
  const buttonState = useEditorState({
    editor,
    selector: ({ editor }) => getBasicTextStyleButtonState(basicTextStyle, editor),
  })

  const toggleStyle = useCallback(() => {
    editor.focus()
    editor.toggleStyles({ [basicTextStyle]: true } as never)
  }, [basicTextStyle, editor])

  if (buttonState === undefined) return null

  const Icon = Reflect.get(TOLARIA_BASIC_TEXT_STYLE_ICONS, basicTextStyle) as PhosphorIcon
  const copy = basicTextStyleCopy(basicTextStyle, locale)

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test={basicTextStyle}
      onClick={toggleStyle}
      isSelected={buttonState.active}
      label={copy.label}
      mainTooltip={copy.mainTooltip}
      secondaryTooltip={copy.secondaryTooltip}
      icon={<Icon />}
    />
  )
}

function basicTextStyleCopy(
  basicTextStyle: TolariaBasicTextStyle,
  locale: AppLocale,
) {
  if (basicTextStyle === MARKDOWN_HIGHLIGHT_STYLE) {
    return {
      label: translate(locale, 'editor.formatting.highlight'),
      mainTooltip: translate(locale, 'editor.formatting.highlightTooltip'),
      secondaryTooltip: '==highlight==',
    }
  }

  return Reflect.get(TOLARIA_BASIC_TEXT_STYLE_TOOLTIPS, basicTextStyle) as {
    label: string
    mainTooltip: string
    secondaryTooltip: string
  }
}

function TolariaBlockTypeSelect() {
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >()
  const selectedBlocks = useEditorState({
    editor,
    selector: ({ editor }): TolariaSelectedBlock[] => getSelectedBlocksSafely(editor),
  })
  const firstSelectedBlock = selectedBlocks[0] ?? null
  const selectItems = useMemo(
    () => (
      firstSelectedBlock
        ? getTolariaBlockTypeSelectOptions(editor, firstSelectedBlock)
        : []
    ),
    [editor, firstSelectedBlock],
  )
  const selectedItem = selectItems.find(
    (item): item is TolariaBlockTypeSelectOption => item.isSelected,
  )

  if (!selectedItem || !editor.isEditable) return null

  return (
    <MantineMenu
      withinPortal={false}
      transitionProps={{ exitDuration: 0 }}
      middlewares={{ flip: true, shift: true, inline: false, size: true }}
    >
      <MantineMenu.Target>
        <MantineButton
          onMouseDown={(event) => {
            event.preventDefault()
            event.currentTarget.focus()
          }}
          leftSection={selectedItem.iconElement}
          rightSection={<ChevronDown size={16} />}
          size="xs"
          variant="subtle"
        >
          {selectedItem.name}
        </MantineButton>
      </MantineMenu.Target>
      <MantineMenu.Dropdown className="bn-select">
        {selectItems.map((item) => (
          <MantineMenu.Item
            key={item.name}
            onClick={() => {
              updateSelectedBlocksToType(editor, selectedBlocks, item)
            }}
            leftSection={item.iconElement}
            rightSection={item.isSelected
              ? <MantineCheckIcon size={10} className="bn-tick-icon" />
              : <div className="bn-tick-space" />}
          >
            {item.name}
          </MantineMenu.Item>
        ))}
      </MantineMenu.Dropdown>
    </MantineMenu>
  )
}

function TolariaFileDownloadButton({ vaultPath }: { vaultPath?: string }) {
  const Components = useComponentsContext()!
  const dict = useDictionary()
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >()
  const selectedFileBlock = useEditorState({
    editor,
    selector: ({ editor }) => getSelectedFileBlockState(editor, vaultPath),
  })
  const handleOpen = useCallback(() => {
    if (!selectedFileBlock) return

    editor.focus()
    openEditorAttachmentOrUrl({
      url: selectedFileBlock.url,
      vaultPath,
      source: 'file',
    })
  }, [editor, selectedFileBlock, vaultPath])

  if (!selectedFileBlock || !editor.isEditable) return null

  const label = fileDownloadTooltip(dict, selectedFileBlock.type)
  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test="fileDownload"
      onClick={handleOpen}
      isSelected={false}
      label={label}
      mainTooltip={label}
      icon={<ExternalLink />}
    />
  )
}

function TolariaFilePathCopyButton({ locale = 'en', vaultPath }: { locale?: AppLocale; vaultPath?: string }) {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >()
  const selectedFileBlock = useEditorState({
    editor,
    selector: ({ editor }) => getSelectedFileBlockState(editor, vaultPath),
  })
  const handleCopy = useCallback(() => {
    if (!selectedFileBlock) return

    editor.focus()
    void writeClipboardText(selectedFileBlock.displayPath).catch((error) => {
      console.warn('[file] Failed to copy media path:', error)
    })
  }, [editor, selectedFileBlock])

  if (!selectedFileBlock || !editor.isEditable) return null

  const label = translate(locale, 'editor.toolbar.copyFilePath')
  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test="filePathCopy"
      onClick={handleCopy}
      isSelected={false}
      label={label}
      mainTooltip={label}
      secondaryTooltip={selectedFileBlock.displayPath}
      icon={<ClipboardText />}
    />
  )
}

function TolariaFileCaptionButton({ locale = 'en', vaultPath }: { locale?: AppLocale; vaultPath?: string }) {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >()
  const selectedFileBlock = useEditorState({
    editor,
    selector: ({ editor }) => getSelectedFileBlockState(editor, vaultPath),
  })
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [draftCaption, setDraftCaption] = useState('')
  const isEditing = selectedFileBlock !== null && editingBlockId === selectedFileBlock.id

  const handleStart = useCallback(() => {
    if (!selectedFileBlock) return
    setEditingBlockId(selectedFileBlock.id)
    setDraftCaption(selectedFileBlock.caption)
  }, [selectedFileBlock])

  const handleCancel = useCallback(() => {
    setEditingBlockId(null)
    setDraftCaption('')
    editor.focus()
  }, [editor])

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedFileBlock) return

    try {
      editor.updateBlock(selectedFileBlock.id, {
        props: { caption: draftCaption.trim() } as never,
      })
      setEditingBlockId(null)
      editor.focus()
    } catch (error) {
      if (isStaleBlockReferenceError(error)) {
        reportStaleFormattingToolbarBlockReference(error)
        return
      }
      throw error
    }
  }, [draftCaption, editor, selectedFileBlock])

  if (!selectedFileBlock || !editor.isEditable) return null

  const label = translate(locale, 'editor.toolbar.editMediaCaption')
  return (
    <>
      <Components.FormattingToolbar.Button
        className="bn-button"
        data-test="fileCaption"
        onClick={handleStart}
        isSelected={isEditing}
        label={label}
        mainTooltip={label}
        icon={<ClipboardText />}
      />
      {isEditing ? (
        <form
          className="flex items-center gap-1 rounded-md border border-border bg-popover p-1 shadow-sm"
          onSubmit={handleSubmit}
        >
          <Input
            aria-label={label}
            className="h-7 w-48 text-xs"
            onChange={(event) => setDraftCaption(event.currentTarget.value)}
            placeholder={translate(locale, 'editor.toolbar.mediaCaptionPlaceholder')}
            value={draftCaption}
          />
          <Button size="xs" type="submit">
            {translate(locale, 'editor.toolbar.saveMediaCaption')}
          </Button>
          <Button onClick={handleCancel} size="xs" type="button" variant="ghost">
            {translate(locale, 'common.cancel')}
          </Button>
        </form>
      ) : null}
    </>
  )
}

function TolariaFileReplaceButton({
  locale = 'en',
  onRequestMediaReplacement,
  vaultPath,
}: {
  locale?: AppLocale
  onRequestMediaReplacement?: MediaReplacementHandler
  vaultPath?: string
}) {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >()
  const selectedFileBlock = useEditorState({
    editor,
    selector: ({ editor }) => getSelectedFileBlockState(editor, vaultPath),
  })
  const [errorMessage, setErrorMessage] = useState('')
  const handleReplace = useCallback(() => {
    if (!selectedFileBlock || !onRequestMediaReplacement) return

    setErrorMessage('')
    void Promise.resolve(onRequestMediaReplacement({
      blockId: selectedFileBlock.id,
      caption: selectedFileBlock.caption,
      displayPath: selectedFileBlock.displayPath,
      type: selectedFileBlock.type,
      url: selectedFileBlock.url,
    })).then((replacement) => {
      if (!replacement) return

      editor.updateBlock(selectedFileBlock.id, {
        props: {
          ...(replacement.name ? { name: replacement.name } : {}),
          url: replacement.url,
        } as never,
      })
      editor.focus()
    }).catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    })
  }, [editor, onRequestMediaReplacement, selectedFileBlock])

  if (!onRequestMediaReplacement || !selectedFileBlock || !editor.isEditable) return null

  const label = translate(locale, 'editor.toolbar.replaceMedia')
  return (
    <>
      <Components.FormattingToolbar.Button
        className="bn-button"
        data-test="fileReplace"
        onClick={handleReplace}
        isSelected={false}
        label={label}
        mainTooltip={label}
        icon={<ExternalLink />}
      />
      {errorMessage ? (
        <span className="text-xs text-destructive" role="status">
          {translate(locale, 'editor.toolbar.replaceMediaFailed')}: {errorMessage}
        </span>
      ) : null}
    </>
  )
}

function selectedEditorText(editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  const editorElement = editor.domElement
  if (!editorElement || !editorElement.contains(range.commonAncestorContainer)) return null

  const text = selection.toString().trim()
  return text.length > 0 ? text : null
}

function inlineTextFromBlockContent(content: unknown): string | null {
  if (!Array.isArray(content)) return null

  const text = content
    .map((item) => (isRecord(item) && typeof item.text === 'string' ? item.text : ''))
    .join('')
    .trim()
  return text.length > 0 ? text : null
}

function selectedInlineAiTarget(editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>): {
  target: InlineAiSuggestionTarget
  text: string
} | null {
  const selectedText = selectedEditorText(editor)
  if (selectedText) return { target: { kind: 'selection' }, text: selectedText }

  const selectedBlocks = getSelectedBlocksSafely(editor)
  if (selectedBlocks.length !== 1) return null

  const block = selectedBlocks[0]
  const blockText = inlineTextFromBlockContent(block.content)
  return blockText ? { target: { blockId: block.id, kind: 'block' }, text: blockText } : null
}

function stripInlineMathDelimiters(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && !trimmed.startsWith('$$') && !trimmed.endsWith('$$')) {
    return trimmed.slice(1, -1).trim()
  }
  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) {
    return trimmed.slice(2, -2).trim()
  }
  return trimmed
}

function selectedInlineLatex(editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>) {
  const text = selectedEditorText(editor)
  if (!text) return null

  const latex = stripInlineMathDelimiters(text)
  return latex.length > 0 ? latex : null
}

function editorSupportsInlineMath(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
) {
  const inlineContentSchema = (editor.schema as { inlineContentSchema?: unknown }).inlineContentSchema
  return isRecord(inlineContentSchema) && MATH_INLINE_TYPE in inlineContentSchema
}

function inlineMathContent(latex: string): InlineMathContent {
  return {
    type: MATH_INLINE_TYPE,
    props: { latex },
    content: undefined,
  }
}

function TolariaInlineMathButton({ locale = 'en' }: { locale?: AppLocale }) {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >()
  const latex = useEditorState({
    editor,
    selector: ({ editor }) => (
      editor.isEditable && editorSupportsInlineMath(editor)
        ? selectedInlineLatex(editor)
        : null
    ),
  })
  const handleInsertMath = useCallback(() => {
    const selectedLatex = selectedInlineLatex(editor)
    if (!selectedLatex) return

    editor.focus()
    editor.insertInlineContent([inlineMathContent(selectedLatex)] as never, { updateSelection: true })
  }, [editor])

  if (!latex) return null

  const label = translate(locale, 'editor.formatting.inlineMath')
  const tooltip = translate(locale, 'editor.formatting.inlineMathTooltip')
  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test="inlineMathButton"
      onClick={handleInsertMath}
      isSelected={false}
      label={label}
      mainTooltip={tooltip}
      secondaryTooltip="$...$"
      icon={<FunctionIcon />}
    />
  )
}

function TolariaAttachSelectedTextButton({
  locale = 'en',
  onAttachSelectedTextContext,
}: {
  locale?: AppLocale
  onAttachSelectedTextContext?: AttachSelectedTextHandler
}) {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >()
  const selectedText = useEditorState({
    editor,
    selector: ({ editor }) => selectedEditorText(editor),
  })
  const handleAttach = useCallback(() => {
    const text = selectedEditorText(editor)
    if (!text) return

    onAttachSelectedTextContext?.(text)
    editor.focus()
  }, [editor, onAttachSelectedTextContext])

  if (!onAttachSelectedTextContext || !selectedText) return null

  const label = translate(locale, 'ai.panel.selectedText.include')
  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test="attachSelectedTextContext"
      onClick={handleAttach}
      isSelected={false}
      label={label}
      mainTooltip={label}
      icon={<Paperclip />}
    />
  )
}

function TolariaInlineAiSuggestionButton({
  locale = 'en',
  onRequestInlineAiSuggestion,
}: {
  locale?: AppLocale
  onRequestInlineAiSuggestion?: InlineAiSuggestionHandler
}) {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >()
  const selectedText = useEditorState({
    editor,
    selector: ({ editor }) => selectedInlineAiTarget(editor)?.text ?? null,
  })
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<'idle' | 'streaming' | 'ready' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [target, setTarget] = useState<InlineAiSuggestionTarget | null>(null)
  const isOpen = status !== 'idle'

  const handleRequest = useCallback(() => {
    const nextTarget = selectedInlineAiTarget(editor)
    if (!nextTarget || !onRequestInlineAiSuggestion) return

    setDraft('')
    setErrorMessage('')
    setTarget(nextTarget.target)
    setStatus('streaming')

    void Promise.resolve(onRequestInlineAiSuggestion(
      {
        blockId: nextTarget.target.kind === 'block' ? nextTarget.target.blockId : undefined,
        operation: 'rewrite',
        selectedText: nextTarget.text,
      },
      {
        onDelta: (delta) => {
          setDraft((current) => `${current}${delta}`)
        },
        onDone: () => {
          setStatus('ready')
        },
        onError: (message) => {
          setErrorMessage(message)
          setStatus('error')
        },
      },
    )).catch((error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setStatus('error')
    })
  }, [editor, onRequestInlineAiSuggestion])

  const handleAccept = useCallback(() => {
    const suggestion = draft.trim()
    if (!suggestion || !target) return

    editor.focus()
    if (target.kind === 'block') {
      editor.updateBlock(target.blockId, { content: suggestion as never })
    } else {
      editor.insertInlineContent(suggestion, { updateSelection: true })
    }
    setStatus('idle')
    setDraft('')
    setErrorMessage('')
    setTarget(null)
  }, [draft, editor, target])

  const handleReject = useCallback(() => {
    setStatus('idle')
    setDraft('')
    setErrorMessage('')
    setTarget(null)
    editor.focus()
  }, [editor])

  if (!onRequestInlineAiSuggestion || !selectedText || !editor.isEditable) return null

  const label = translate(locale, 'editor.inlineAi.suggest')
  return (
    <>
      <Components.FormattingToolbar.Button
        className="bn-button"
        data-test="inlineAiSuggestion"
        onClick={handleRequest}
        isSelected={isOpen}
        label={label}
        mainTooltip={label}
        icon={<Highlighter />}
      />
      {isOpen ? (
        <div className="pointer-events-auto flex max-w-[24rem] flex-col gap-2 rounded-md border border-border bg-popover p-2 text-xs shadow-sm">
          <div className="text-muted-foreground">
            {status === 'streaming'
              ? translate(locale, 'editor.inlineAi.streaming')
              : status === 'error'
                ? translate(locale, 'editor.inlineAi.failed')
                : translate(locale, 'editor.inlineAi.ready')}
          </div>
          {status === 'error' ? (
            <div className="text-destructive">{errorMessage}</div>
          ) : (
            <div className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 text-foreground">
              {draft || translate(locale, 'editor.inlineAi.emptyDraft')}
            </div>
          )}
          <div className="flex justify-end gap-1">
            <Button onClick={handleReject} size="xs" type="button" variant="ghost">
              {translate(locale, 'editor.inlineAi.reject')}
            </Button>
            <Button disabled={draft.trim().length === 0 || status === 'error'} onClick={handleAccept} size="xs" type="button">
              {translate(locale, 'editor.inlineAi.accept')}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
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
        return [<TolariaBlockTypeSelect key={item.key} />]
      case 'fileDownloadButton':
        return [
          <TolariaFileDownloadButton key={item.key} vaultPath={vaultPath} />,
          <TolariaFileReplaceButton
            key="fileReplaceButton"
            locale={locale}
            onRequestMediaReplacement={onRequestMediaReplacement}
            vaultPath={vaultPath}
          />,
          <TolariaFileCaptionButton key="fileCaptionButton" locale={locale} vaultPath={vaultPath} />,
          <TolariaFilePathCopyButton key="filePathCopyButton" locale={locale} vaultPath={vaultPath} />,
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
    <TolariaBasicTextStyleButton basicTextStyle="code" key="codeStyleButton" />,
    <TolariaBasicTextStyleButton
      basicTextStyle={MARKDOWN_HIGHLIGHT_STYLE}
      key="highlightStyleButton"
      locale={locale}
    />,
    <TolariaInlineMathButton
      key="inlineMathButton"
      locale={locale}
    />,
    <TolariaAttachSelectedTextButton
      key="attachSelectedTextContextButton"
      locale={locale}
      onAttachSelectedTextContext={onAttachSelectedTextContext}
    />,
    <TolariaInlineAiSuggestionButton
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
