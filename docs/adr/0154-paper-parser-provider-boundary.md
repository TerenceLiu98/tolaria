# ADR-0154: Paper Parser Provider Boundary

## Status

Accepted

## Context

Paper entities need `blocks.jsonl` before block citations, annotation workflows, and future reader features can operate on parsed PDF structure. The PRD names MinerU as a likely parser, but production credentials and API details are not yet settled. Tolaria also needs a local development path that can exercise the sidecar contract without uploading PDFs or adding heavyweight parser dependencies.

## Decision

Use an explicit parser-provider boundary for Paper parsing. Parser provider selection is installation-local app settings, not vault-authored state. The initial providers are:

- `none`: parsing is disabled; `parse_paper` returns a recoverable `missing_provider` error.
- `dev-fixture`: writes deterministic sample SourceBlocks to `blocks.jsonl` for local testing.
- `mineru`: validates an API token or token environment variable, then returns a clear `provider_unavailable` error until the production adapter is implemented.

The Tauri command `parse_paper(vaultPath, paperId, settings)` resolves `papers/<paper-slug>/paper.md`, `source.pdf`, and `blocks.jsonl` through the active-vault boundary. Successful parsing writes normalized SourceBlock JSONL, updates parse metadata in `paper.md`, and never mutates `source.pdf`.

The frontend owns provider settings UI, missing-config messaging, remote-parser privacy warning, and Paper Reader "Parse Paper" action visibility when `blocks.jsonl` is missing.

## Consequences

- The Reader can generate test `blocks.jsonl` now without committing to a production parser API.
- Remote parsing is explicit and can show privacy warnings before any PDF leaves the device.
- Parser output remains a vault sidecar, not application cache or database state.
- Future parser providers can implement the same `PaperParseResult` contract without changing the Paper Reader or citation syntax.

## Alternatives Considered

- Integrate MinerU directly in the Reader: rejected because parser credentials, upload behavior, and error handling belong behind a command boundary.
- Parse automatically on import: rejected because remote parsing must be explicit and missing sidecars are valid Paper states.
- Store parser settings in `paper.md`: rejected because provider credentials and parser choice are installation-local, not durable vault content.
