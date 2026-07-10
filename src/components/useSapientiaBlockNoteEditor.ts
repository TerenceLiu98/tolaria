import { useEffect, useRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { uploadImageFile } from '../hooks/useImageDrop'
import { RUNTIME_STYLE_NONCE } from '../lib/runtimeStyleNonce'
import {
  installBlockNoteDirectMarkdown,
  type DirectMarkdownCapableSerializer,
} from '../utils/blockNoteDirectMarkdown'
import { createImeCompositionKeyGuardExtension } from './imeCompositionKeyGuardExtension'
import { createMarkdownHighlightShortcutExtension } from './markdownHighlightShortcutExtension'
import { handleRichEditorPaste } from './richEditorPaste'
import { createRichEditorMarkdownInputTransformExtension } from './richEditorInputTransformExtension'
import { createRichEditorTextDirectionExtension } from './richEditorTextDirection'
import { createRichEditorTransformErrorRecoveryExtension } from './richEditorTransformErrorRecoveryExtension'
import { createRichEditorBlockSelectionExtension } from './richEditorBlockSelectionExtension'
import { createRichEditorCodeBlockTabExtension } from './richEditorCodeBlockTabExtension'
import { installRichEditorDispatchPerformanceProbe } from './richEditorDispatchPerformance'
import { RICH_EDITOR_BLOCKNOTE_PERFORMANCE_OPTIONS } from './richEditorBlockNoteOptions'
import { schema } from './editorSchema'
import { useFilenameAutolinkGuard } from './useFilenameAutolinkGuard'

const RICH_EDITOR_BIDI_DOM_ATTRIBUTES = {
  blockContent: { dir: 'auto' },
  inlineContent: { dir: 'auto' },
}

interface SapientiaBlockNoteEditorOptions {
  activePath?: string | null
  vaultPath?: string
}

export function useSapientiaBlockNoteEditor({
  activePath = null,
  vaultPath,
}: SapientiaBlockNoteEditorOptions) {
  const activePathRef = useRef(activePath)
  const vaultPathRef = useRef(vaultPath)
  useEffect(() => { activePathRef.current = activePath }, [activePath])
  useEffect(() => { vaultPathRef.current = vaultPath }, [vaultPath])

  const editor = useCreateBlockNote({
    ...RICH_EDITOR_BLOCKNOTE_PERFORMANCE_OPTIONS,
    schema,
    domAttributes: RICH_EDITOR_BIDI_DOM_ATTRIBUTES,
    uploadFile: (file: File) => uploadImageFile(file, vaultPathRef.current),
    pasteHandler: handleRichEditorPaste,
    tabBehavior: 'prefer-indent',
    _tiptapOptions: { injectNonce: RUNTIME_STYLE_NONCE },
    extensions: [
      createRichEditorTransformErrorRecoveryExtension(),
      createImeCompositionKeyGuardExtension(),
      createRichEditorCodeBlockTabExtension(),
      createMarkdownHighlightShortcutExtension(),
      createRichEditorMarkdownInputTransformExtension(),
      createRichEditorTextDirectionExtension(),
      createRichEditorBlockSelectionExtension(),
    ],
  })

  if ('pmSchema' in editor && '_tiptapEditor' in editor) {
    installBlockNoteDirectMarkdown(editor as DirectMarkdownCapableSerializer)
  }
  useEffect(() => {
    installRichEditorDispatchPerformanceProbe(editor, () => activePathRef.current)
  }, [editor])
  useFilenameAutolinkGuard(editor)
  return editor
}
