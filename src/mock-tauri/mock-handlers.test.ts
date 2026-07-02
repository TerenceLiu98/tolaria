import { describe, expect, it } from 'vitest'
import { MOCK_CONTENT } from './mock-content'
import { mockHandlers } from './mock-handlers'

describe('mockHandlers git remote state', () => {
  it('keeps starter vaults local-only until a remote is added', () => {
    const vaultPath = '/Users/mock/Documents/Getting Started Test'

    expect(mockHandlers.create_getting_started_vault({ targetPath: vaultPath })).toBe(vaultPath)
    expect(mockHandlers.git_remote_status({ vaultPath }).hasRemote).toBe(false)

    expect(
      mockHandlers.git_add_remote({
        request: {
          vaultPath,
          remoteUrl: 'https://example.com/starter.git',
        },
      }).status,
    ).toBe('connected')

    expect(mockHandlers.git_remote_status({ vaultPath }).hasRemote).toBe(true)
  })

  it('starts empty vaults without a remote and keeps cloned vaults remote-backed', () => {
    const emptyVaultPath = '/Users/mock/Documents/Local Vault'
    const clonedVaultPath = '/Users/mock/Documents/Cloned Vault'

    expect(mockHandlers.create_empty_vault({ targetPath: emptyVaultPath })).toBe(emptyVaultPath)
    expect(mockHandlers.git_remote_status({ vaultPath: emptyVaultPath }).hasRemote).toBe(false)

    expect(mockHandlers.clone_repo({ url: 'https://example.com/repo.git', localPath: clonedVaultPath })).toContain(clonedVaultPath)
    expect(mockHandlers.git_remote_status({ vaultPath: clonedVaultPath }).hasRemote).toBe(true)
  })
})

describe('mockHandlers paper annotation commands', () => {
  it('reads, saves, updates, and deletes annotation sidecars', () => {
    const vaultPath = '/Users/mock/Annotation Test'
    const paperId = 'paper-annotations'
    const path = `${vaultPath}/papers/${paperId}/annotations.jsonl`
    Reflect.deleteProperty(MOCK_CONTENT, path)

    expect(mockHandlers.read_paper_annotations({ vaultPath, paperId })).toMatchObject({
      annotations: [],
      paperId,
      path,
      state: 'missing',
    })

    const saved = mockHandlers.save_paper_annotation({
      vaultPath,
      paperId,
      annotation: {
        id: 'ann-1',
        paper_id: paperId,
        block_id: 'b1',
        kind: 'highlight',
        color: 'important',
        created_at: '2026-07-02T10:15:00Z',
      },
    })
    expect(saved.annotations).toHaveLength(1)
    expect(MOCK_CONTENT[path]).toContain('"id":"ann-1"')

    const updated = mockHandlers.save_paper_annotation({
      vaultPath,
      paperId,
      annotation: {
        ...saved.annotations[0],
        kind: 'question',
        note: 'Why?',
      },
    })
    expect(updated.annotations).toHaveLength(1)
    expect(updated.annotations[0]).toMatchObject({ kind: 'question', note: 'Why?' })

    const deleted = mockHandlers.delete_paper_annotation({ vaultPath, paperId, annotationId: 'ann-1' })
    expect(deleted.annotations).toEqual([])
    expect(MOCK_CONTENT[path]).toBe('')
  })

  it('returns structured errors for malformed annotation JSONL', () => {
    const vaultPath = '/Users/mock/Annotation Test'
    const paperId = 'paper-annotations-malformed'
    const path = `${vaultPath}/papers/${paperId}/annotations.jsonl`
    MOCK_CONTENT[path] = '{not json}\n'

    let thrown: unknown = null
    try {
      mockHandlers.read_paper_annotations({ vaultPath, paperId })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({
      kind: 'invalid_jsonl',
      lineErrors: [expect.objectContaining({ kind: 'malformed_json', line: 1 })],
    })
  })
})
