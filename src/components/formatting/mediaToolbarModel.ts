import { portableAttachmentPathFromCurrentVaultAssetUrl } from '../../utils/vaultAttachments'

export const FORMATTING_TOOLBAR_FILE_BLOCK_TYPES = new Set([
  'audio',
  'file',
  'image',
  'video',
])

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

export type FormattingToolbarBlockLike = {
  id: string
  props: Record<string, unknown>
  type: string
}

export type FormattingToolbarSelectedFileBlock = {
  caption: string
  displayPath: string
  id: string
  type: string
  url: string
}

export function selectedFileBlockFromBlocks(
  selectedBlocks: readonly FormattingToolbarBlockLike[],
  vaultPath?: string,
): FormattingToolbarSelectedFileBlock | null {
  if (selectedBlocks.length !== 1) return null

  const block = selectedBlocks.at(0)
  if (!block || !FORMATTING_TOOLBAR_FILE_BLOCK_TYPES.has(block.type)) return null

  const url = block.props.url
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

export function mediaCaptionPatch(caption: string): { props: { caption: string } } {
  return { props: { caption: caption.trim() } }
}

export function mediaReplacementRequest(
  selectedFileBlock: FormattingToolbarSelectedFileBlock,
): MediaReplacementRequest {
  return {
    blockId: selectedFileBlock.id,
    caption: selectedFileBlock.caption,
    displayPath: selectedFileBlock.displayPath,
    type: selectedFileBlock.type,
    url: selectedFileBlock.url,
  }
}

export function mediaReplacementPatch(
  replacement: MediaReplacementResult,
): { props: { name?: string; url: string } } {
  return {
    props: {
      ...(replacement.name ? { name: replacement.name } : {}),
      url: replacement.url,
    },
  }
}
