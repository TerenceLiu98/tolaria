export const PAPER_TYPE_NAME = 'Paper'

export function isPaperTypeName(type: string | null | undefined): boolean {
  return type?.trim().toLowerCase() === PAPER_TYPE_NAME.toLowerCase()
}
