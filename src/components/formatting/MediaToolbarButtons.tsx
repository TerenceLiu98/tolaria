import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
} from '@blocknote/react'
import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core'
import {
  ArrowSquareOut as ExternalLink,
  ClipboardText,
} from '@phosphor-icons/react'
import { useCallback, useState, type FormEvent } from 'react'
import { translate, type AppLocale } from '../../lib/i18n'
import { writeClipboardText } from '../../utils/clipboardText'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { openEditorAttachmentOrUrl } from '../editorAttachmentActions'
import {
  isStaleBlockReferenceError,
  reportRecoveredEditorTransformError,
} from '../richEditorTransformErrorRecoveryExtension'
import { getSelectedBlocksSafely } from './toolbarBlocks'
import {
  mediaCaptionPatch,
  mediaReplacementPatch,
  mediaReplacementRequest,
  selectedFileBlockFromBlocks,
  type FormattingToolbarSelectedFileBlock,
  type MediaReplacementRequest,
  type MediaReplacementResult,
} from './mediaToolbarModel'

export type MediaReplacementHandler = (
  request: MediaReplacementRequest,
) => MediaReplacementResult | null | Promise<MediaReplacementResult | null>

function getSelectedFileBlockState(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
  vaultPath?: string,
): FormattingToolbarSelectedFileBlock | null {
  return selectedFileBlockFromBlocks(
    getSelectedBlocksSafely(editor).map((block) => ({
      id: block.id,
      props: block.props as Record<string, unknown>,
      type: block.type,
    })),
    vaultPath,
  )
}

function reportStaleFormattingToolbarBlockReference(error: unknown) {
  reportRecoveredEditorTransformError('stale_block_reference', error)
}

export function MediaDownloadButton({ locale = 'en', vaultPath }: { locale?: AppLocale; vaultPath?: string }) {
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

  const label = translate(locale, 'editor.toolbar.openMedia')
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

export function MediaPathCopyButton({ locale = 'en', vaultPath }: { locale?: AppLocale; vaultPath?: string }) {
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

export function MediaCaptionButton({ locale = 'en', vaultPath }: { locale?: AppLocale; vaultPath?: string }) {
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
      editor.updateBlock(selectedFileBlock.id, mediaCaptionPatch(draftCaption) as never)
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

export function MediaReplaceButton({
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
    void Promise.resolve(onRequestMediaReplacement(mediaReplacementRequest(selectedFileBlock))).then((replacement) => {
      if (!replacement) return

      try {
        editor.updateBlock(selectedFileBlock.id, mediaReplacementPatch(replacement) as never)
      } catch (error) {
        if (isStaleBlockReferenceError(error)) {
          reportStaleFormattingToolbarBlockReference(error)
          return
        }
        throw error
      }
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
