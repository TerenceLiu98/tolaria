import { describe, expect, it } from 'vitest'
import {
  normalizePaperParserSettings,
  validatePaperParserSettings,
} from './parserSettings'

describe('paper parser settings', () => {
  it('defaults to no parser provider', () => {
    expect(normalizePaperParserSettings({})).toEqual({
      mineruTokenRef: null,
      provider: 'none',
    })
  })

  it('preserves the dev fixture provider without remote config', () => {
    expect(normalizePaperParserSettings({
      paper_parser_provider: 'dev-fixture',
      paper_parser_mineru_token_ref: 'MINERU_TOKEN',
    })).toEqual({
      mineruTokenRef: 'MINERU_TOKEN',
      provider: 'dev-fixture',
    })
    expect(validatePaperParserSettings({
      mineruTokenRef: null,
      provider: 'dev-fixture',
    })).toEqual({ ok: true })
  })

  it('requires a MinerU token when MinerU is selected', () => {
    expect(validatePaperParserSettings({
      mineruTokenRef: null,
      provider: 'mineru',
    })).toEqual({
      kind: 'missing_config',
      message: 'MinerU parsing requires an API token or token environment variable.',
      ok: false,
    })
  })

  it('accepts a MinerU token reference without exposing token text', () => {
    expect(validatePaperParserSettings({
      mineruTokenRef: 'MINERU_API_TOKEN',
      provider: 'mineru',
    })).toEqual({ ok: true })
  })
})
