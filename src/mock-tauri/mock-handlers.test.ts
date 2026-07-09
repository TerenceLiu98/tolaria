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

describe('mockHandlers paper comment commands', () => {
  it('reads, saves, updates, and deletes comment sidecars', () => {
    const vaultPath = '/Users/mock/Comment Test'
    const paperId = 'paper-comments'
    const path = `${vaultPath}/papers/${paperId}/comments.jsonl`
    Reflect.deleteProperty(MOCK_CONTENT, path)

    expect(mockHandlers.read_paper_comments({ vaultPath, paperId })).toMatchObject({
      comments: [],
      paperId,
      path,
      state: 'missing',
    })

    const saved = mockHandlers.save_paper_comment({
      vaultPath,
      paperId,
      comment: {
        id: 'ann-1',
        paper_id: paperId,
        block_id: 'b1',
        kind: 'comment',
        created_at: '2026-07-02T10:15:00Z',
      },
    })
    expect(saved.comments).toHaveLength(1)
    expect(MOCK_CONTENT[path]).toContain('"id":"ann-1"')

    const updated = mockHandlers.save_paper_comment({
      vaultPath,
      paperId,
      comment: {
        ...saved.comments[0],
        note: 'Why?',
      },
    })
    expect(updated.comments).toHaveLength(1)
    expect(updated.comments[0]).toMatchObject({ kind: 'comment', note: 'Why?' })

    const deleted = mockHandlers.delete_paper_comment({ vaultPath, paperId, commentId: 'ann-1' })
    expect(deleted.comments).toEqual([])
    expect(MOCK_CONTENT[path]).toBe('')
  })

  it('returns structured errors for malformed comment JSONL', () => {
    const vaultPath = '/Users/mock/Comment Test'
    const paperId = 'paper-comments-malformed'
    const path = `${vaultPath}/papers/${paperId}/comments.jsonl`
    MOCK_CONTENT[path] = '{not json}\n'

    let thrown: unknown = null
    try {
      mockHandlers.read_paper_comments({ vaultPath, paperId })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({
      kind: 'invalid_jsonl',
      lineErrors: [expect.objectContaining({ kind: 'malformed_json', line: 1 })],
    })
  })

  it('resets malformed comment sidecars to an empty recoverable state', () => {
    const vaultPath = '/Users/mock/Comment Test'
    const paperId = 'paper-comments-reset'
    const path = `${vaultPath}/papers/${paperId}/comments.jsonl`
    MOCK_CONTENT[path] = '{not json}\n'

    const reset = mockHandlers.reset_paper_comments({ vaultPath, paperId })

    expect(reset).toMatchObject({
      comments: [],
      paperId,
      path,
      state: 'empty',
    })
    expect(MOCK_CONTENT[path]).toBe('')
  })
})
