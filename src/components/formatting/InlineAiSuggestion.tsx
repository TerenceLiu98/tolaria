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
import { Highlighter } from '@phosphor-icons/react'
import { useCallback, useState } from 'react'
import { translate, type AppLocale } from '../../lib/i18n'
import { Button } from '../ui/button'
import {
  acceptedInlineAiSuggestion,
  appendInlineAiSuggestionDelta,
  completeInlineAiSuggestion,
  failInlineAiSuggestion,
  initialInlineAiSuggestionState,
  selectedInlineAiBlockTarget,
  startInlineAiSuggestion,
  type InlineAiSuggestionTarget,
} from './inlineAiSuggestionModel'
import { getSelectedBlocksSafely } from './toolbarBlocks'
import { selectedEditorText } from './toolbarSelection'

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

function selectedInlineAiTarget(editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>): {
  target: InlineAiSuggestionTarget
  text: string
} | null {
  const selectedText = selectedEditorText(editor)
  if (selectedText) return { target: { kind: 'selection' }, text: selectedText }

  return selectedInlineAiBlockTarget(getSelectedBlocksSafely(editor))
}

export function InlineAiSuggestionButton({
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
  const [suggestionState, setSuggestionState] = useState(initialInlineAiSuggestionState)
  const isOpen = suggestionState.status !== 'idle'

  const handleRequest = useCallback(() => {
    const nextTarget = selectedInlineAiTarget(editor)
    if (!nextTarget || !onRequestInlineAiSuggestion) return

    setSuggestionState(startInlineAiSuggestion(nextTarget.target))

    void Promise.resolve(onRequestInlineAiSuggestion(
      {
        blockId: nextTarget.target.kind === 'block' ? nextTarget.target.blockId : undefined,
        operation: 'rewrite',
        selectedText: nextTarget.text,
      },
      {
        onDelta: (delta) => {
          setSuggestionState((current) => appendInlineAiSuggestionDelta(current, delta))
        },
        onDone: () => {
          setSuggestionState(completeInlineAiSuggestion)
        },
        onError: (message) => {
          setSuggestionState((current) => failInlineAiSuggestion(current, message))
        },
      },
    )).catch((error: unknown) => {
      setSuggestionState((current) => failInlineAiSuggestion(
        current,
        error instanceof Error ? error.message : String(error),
      ))
    })
  }, [editor, onRequestInlineAiSuggestion])

  const handleAccept = useCallback(() => {
    const acceptedSuggestion = acceptedInlineAiSuggestion(suggestionState)
    if (!acceptedSuggestion) return

    editor.focus()
    if (acceptedSuggestion.target.kind === 'block') {
      editor.updateBlock(acceptedSuggestion.target.blockId, { content: acceptedSuggestion.suggestion as never })
    } else {
      editor.insertInlineContent(acceptedSuggestion.suggestion, { updateSelection: true })
    }
    setSuggestionState(initialInlineAiSuggestionState())
  }, [editor, suggestionState])

  const handleReject = useCallback(() => {
    setSuggestionState(initialInlineAiSuggestionState())
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
            {suggestionState.status === 'streaming'
              ? translate(locale, 'editor.inlineAi.streaming')
              : suggestionState.status === 'error'
                ? translate(locale, 'editor.inlineAi.failed')
                : translate(locale, 'editor.inlineAi.ready')}
          </div>
          {suggestionState.status === 'error' ? (
            <div className="text-destructive">{suggestionState.errorMessage}</div>
          ) : (
            <div className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 text-foreground">
              {suggestionState.draft || translate(locale, 'editor.inlineAi.emptyDraft')}
            </div>
          )}
          <div className="flex justify-end gap-1">
            <Button onClick={handleReject} size="xs" type="button" variant="ghost">
              {translate(locale, 'editor.inlineAi.reject')}
            </Button>
            <Button
              disabled={suggestionState.draft.trim().length === 0 || suggestionState.status === 'error'}
              onClick={handleAccept}
              size="xs"
              type="button"
            >
              {translate(locale, 'editor.inlineAi.accept')}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
