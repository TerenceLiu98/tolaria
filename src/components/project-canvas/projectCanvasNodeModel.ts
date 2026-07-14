import { isTauri } from '../../mock-tauri'
import type { ProjectCanvasNode } from '../../projectCanvas'
import { attachmentAssetUrlFromPath } from '../../utils/vaultAttachments'

export function imageSourceForNode(node: ProjectCanvasNode, vaultPath: string): string | null {
  const ref = node.ref?.trim()
  if (!ref) return null
  if (/^(https?:|data:|asset:|blob:)/u.test(ref)) return ref
  if (!isTauri() || !vaultPath) return ref
  const normalizedVaultPath = vaultPath.replace(/\/+$/u, '')
  const path = ref.startsWith('/') ? ref : `${normalizedVaultPath}/${ref}`
  return attachmentAssetUrlFromPath({ path })
}

export function titleFromPath(path: string): string {
  const normalized = path.trim().replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).at(-1) ?? normalized
}

export function looksLikeImageRef(value: string): boolean {
  return /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/iu.test(value.trim())
}

export function looksLikeBlockCitation(value: string): boolean {
  return /^@block\[[^\]#]+#[^\]]+\]$/u.test(value.trim())
}
