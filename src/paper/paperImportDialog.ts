import { isTauri } from '../mock-tauri'

function normalizePickedFilePath(selected: string | string[] | null): string | null {
  const selectedPath = Array.isArray(selected)
    ? (typeof selected[0] === 'string' ? selected[0] : null)
    : selected
  if (typeof selectedPath !== 'string' || selectedPath.trim().length === 0) return null
  if (!selectedPath.startsWith('file://')) return selectedPath

  try {
    const parsed = new URL(selectedPath)
    if (parsed.protocol !== 'file:') return selectedPath
    const decodedPath = decodeURIComponent(parsed.pathname)
    return parsed.hostname ? `//${parsed.hostname}${decodedPath}` : decodedPath
  } catch {
    return selectedPath
  }
}

let paperPdfPickerInFlight = false

export async function pickPaperPdf(title: string): Promise<string | null> {
  if (paperPdfPickerInFlight) return null

  paperPdfPickerInFlight = true
  try {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      return normalizePickedFilePath(await open({
        directory: false,
        multiple: false,
        title,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      }))
    }

    return normalizePickedFilePath(prompt(title))
  } finally {
    paperPdfPickerInFlight = false
  }
}
