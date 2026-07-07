import { describe, expect, it } from 'vitest'
import {
  tableHeaderContent,
  tableHeaderContentKey,
  tableHeaderEnabled,
  toggledTableHeaderContent,
} from './tableHeaderModel'

describe('tableHeaderModel', () => {
  it('extracts table content only from table blocks', () => {
    const table = {
      content: { headerRows: 1, rows: [], type: 'tableContent' },
      type: 'table',
    }

    expect(tableHeaderContent(table)).toEqual(table.content)
    expect(tableHeaderContent({ content: table.content, type: 'paragraph' })).toBeUndefined()
    expect(tableHeaderContent({ content: [], type: 'table' })).toBeUndefined()
    expect(tableHeaderContent(null)).toBeUndefined()
  })

  it('maps table header axes to the durable BlockNote content keys', () => {
    expect(tableHeaderContentKey('row')).toBe('headerRows')
    expect(tableHeaderContentKey('column')).toBe('headerCols')
  })

  it('toggles row and column header content without mutating other table content', () => {
    const content = {
      headerCols: 1,
      headerRows: undefined,
      rows: [['A']],
      type: 'tableContent',
    }

    expect(tableHeaderEnabled(content, 'column')).toBe(true)
    expect(tableHeaderEnabled(content, 'row')).toBe(false)
    expect(toggledTableHeaderContent(content, 'column', true)).toEqual({
      ...content,
      headerCols: undefined,
    })
    expect(toggledTableHeaderContent(content, 'row', false)).toEqual({
      ...content,
      headerRows: 1,
    })
  })
})
