import { describe, expect, it } from 'vitest'
import { makeEntry } from '../../test-utils/noteListTestUtils'
import { matchesNoteListQuery } from './noteListSearch'

describe('noteListSearch', () => {
  it('does not match hidden Paper block anchors in snippets', () => {
    const entry = makeEntry({
      title: 'Paper',
      snippet: '<!-- tolaria:block id="b0001" page="1" kind="paragraph" hash="sha256:a" -->\nReadable paper text',
    })
    const context = {
      allEntries: [entry],
      typeEntryMap: {},
    }

    expect(matchesNoteListQuery(entry, 'tolaria:block', context)).toBe(false)
    expect(matchesNoteListQuery(entry, 'readable', context)).toBe(true)
  })
})
