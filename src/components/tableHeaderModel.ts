export type TableHeaderAxis = 'column' | 'row'
export type TableHeaderContentKey = 'headerCols' | 'headerRows'

export type TableHeaderContent = Record<string, unknown> & {
  headerCols?: unknown
  headerRows?: unknown
}

const TABLE_HEADER_CONTENT_KEYS: Record<TableHeaderAxis, TableHeaderContentKey> = {
  column: 'headerCols',
  row: 'headerRows',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function tableHeaderContent(block: unknown): TableHeaderContent | undefined {
  if (!isRecord(block) || block.type !== 'table' || !isRecord(block.content)) return undefined
  return block.content
}

export function tableHeaderContentKey(axis: TableHeaderAxis): TableHeaderContentKey {
  return TABLE_HEADER_CONTENT_KEYS[axis]
}

export function tableHeaderEnabled(content: TableHeaderContent, axis: TableHeaderAxis): boolean {
  return Boolean(content[tableHeaderContentKey(axis)])
}

export function toggledTableHeaderContent(
  content: TableHeaderContent,
  axis: TableHeaderAxis,
  enabled: boolean,
): TableHeaderContent {
  return {
    ...content,
    [tableHeaderContentKey(axis)]: enabled ? undefined : 1,
  }
}
