import type { VaultEntry, VaultPropertyValue } from '../../types'

export function relativeVaultPath(path: string, vaultPath?: string): string {
  if (!vaultPath) return path
  const prefix = vaultPath.endsWith('/') ? vaultPath : `${vaultPath}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

export function findEntryForProjectCanvasRef(
  entries: VaultEntry[],
  ref: string | undefined,
  targetPath: string | undefined,
  vaultPath?: string,
): VaultEntry | null {
  const candidates = [targetPath, ref].filter((value): value is string => Boolean(value?.trim()))
  for (const candidate of candidates) {
    const normalizedCandidate = candidate.replace(/^\[\[/u, '').replace(/\]\]$/u, '')
    const found = entries.find(entry => {
      const entryRelativePath = relativeVaultPath(entry.path, vaultPath)
      return entry.path === normalizedCandidate
        || entryRelativePath === normalizedCandidate
        || entryRelativePath.replace(/\.md$/u, '') === normalizedCandidate.replace(/\.md$/u, '')
        || entry.title === normalizedCandidate
    })
    if (found) return found
  }
  return null
}

function stringProperty(value: VaultPropertyValue | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (typeof value === 'number') return String(value)
  return null
}

function stringArrayProperty(value: VaultPropertyValue | undefined): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
      .map(String)
      .map(item => item.trim())
      .filter(Boolean)
  }
  if (typeof value !== 'string') return []
  return value
    .split(/[\n;]+/u)
    .flatMap(part => part.split(/\s+and\s+/iu))
    .map(author => author.trim())
    .filter(Boolean)
}

function shortAuthorLabel(authors: string[]): string | null {
  const firstAuthor = authors[0]?.trim()
  if (!firstAuthor) return null
  const lastName = firstAuthor
    .replace(/\s*\([^)]*\)\s*/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean)
    .at(-1)
  if (!lastName) return null
  return authors.length > 1 ? `${lastName} et al.` : lastName
}

export function paperSubtitle(entry: VaultEntry): string | null {
  const author = shortAuthorLabel(stringArrayProperty(entry.properties.authors))
  const year = stringProperty(entry.properties.year)
  const venue = stringProperty(entry.properties.venue_short) ?? stringProperty(entry.properties.venue)
  const metadataStatus = stringProperty(entry.properties.metadata_status)
  const parts = [author, year, venue, metadataStatus].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' / ') : null
}

export function boundedSnippet(snippet: string | null | undefined, maxLength = 180): string | null {
  const normalized = snippet?.replace(/\s+/gu, ' ').trim()
  if (!normalized) return null
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3).trim()}...` : normalized
}
