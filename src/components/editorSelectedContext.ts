import type { VaultEntry } from '../types'
import type { AiSelectedImageContext } from '../utils/ai-context'
import { portableAttachmentPathFromCurrentVaultAssetUrl } from '../utils/vaultAttachments'

const IMAGE_BLOCK_CONTAINER_SELECTOR = '[data-node-type="blockContainer"][data-id]'

type ImageBlockCandidate = {
  type?: unknown
  props?: {
    url?: unknown
  }
}

type EditorImageBlockLookup = {
  getBlock?: (id: string) => ImageBlockCandidate | null | undefined
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function imageBlockUrl(block: ImageBlockCandidate | null | undefined): string | null {
  if (block?.type !== 'image') return null
  return nonEmptyString(block.props?.url)
}

function displayImagePath(url: string, vaultPath?: string): string {
  if (!vaultPath) return url

  return portableAttachmentPathFromCurrentVaultAssetUrl({ url, vaultPath }) ?? url
}

export function selectedImageContextFromBlock(options: {
  block: ImageBlockCandidate | null | undefined
  sourceEntry: VaultEntry
  vaultPath?: string
}): AiSelectedImageContext | null {
  const url = imageBlockUrl(options.block)
  if (!url) return null

  return {
    kind: 'image',
    entryPath: options.sourceEntry.path,
    entryTitle: options.sourceEntry.title,
    path: displayImagePath(url, options.vaultPath),
    sourceUrl: url,
  }
}

function blockContainerForTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Node)) return null
  const element = target instanceof HTMLElement ? target : target.parentElement
  return element?.closest<HTMLElement>(IMAGE_BLOCK_CONTAINER_SELECTOR) ?? null
}

function blockFromTarget(options: {
  editor: EditorImageBlockLookup
  target: EventTarget | null
}): ImageBlockCandidate | null {
  const blockId = blockContainerForTarget(options.target)?.dataset.id
  if (!blockId || typeof options.editor.getBlock !== 'function') return null

  try {
    return options.editor.getBlock(blockId) ?? null
  } catch {
    return null
  }
}

export function selectedImageContextFromTarget(options: {
  editor: EditorImageBlockLookup
  sourceEntry: VaultEntry
  target: EventTarget | null
  vaultPath?: string
}): AiSelectedImageContext | null {
  return selectedImageContextFromBlock({
    block: blockFromTarget(options),
    sourceEntry: options.sourceEntry,
    vaultPath: options.vaultPath,
  })
}
