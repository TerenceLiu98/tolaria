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
import { Function as FunctionIcon } from '@phosphor-icons/react'
import { useCallback } from 'react'
import { translate, type AppLocale } from '../../lib/i18n'
import { MATH_INLINE_TYPE } from '../../utils/mathMarkdown'
import { selectedEditorText } from './toolbarSelection'

type InlineMathContent = {
  content?: undefined
  props: { latex: string }
  type: typeof MATH_INLINE_TYPE
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

function selectedInlineLatex(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
) {
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

export function InlineMathButton({ locale = 'en' }: { locale?: AppLocale }) {
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
