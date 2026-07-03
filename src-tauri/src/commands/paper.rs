use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};

use super::vault::VaultBoundary;
use crate::commands::expand_tilde;
use crate::paper::{
    self, ImportPaperPdfResult, PaperAnnotation, PaperAnnotationsError, PaperAnnotationsReadResult,
    PaperBlockLookupResult, PaperBlockSearchResult, PaperBlocksError, PaperBlocksReadResult,
    PaperParseError, PaperParseResult, PaperParserProvider, PaperParserSettings,
    PaperPdfOutlineReadResult,
};

#[tauri::command]
pub async fn import_paper_pdf(
    vault_path: PathBuf,
    source_path: PathBuf,
) -> Result<ImportPaperPdfResult, String> {
    tokio::task::spawn_blocking(move || {
        let expanded_vault_path = expand_tilde(vault_path.to_string_lossy().as_ref()).into_owned();
        paper::import_paper_pdf(Path::new(&expanded_vault_path), &source_path)
    })
    .await
    .map_err(|error| format!("Task panicked: {error}"))?
}

#[tauri::command]
pub async fn read_paper_blocks(
    vault_path: PathBuf,
    paper_id: String,
) -> Result<PaperBlocksReadResult, PaperBlocksError> {
    let error_paper_id = paper_id.clone();
    tokio::task::spawn_blocking(move || {
        let blocks_path = blocks_path_for_paper(&vault_path, &paper_id)?;
        paper::read_paper_blocks_file(&paper_id, &blocks_path)
    })
    .await
    .map_err(|error| PaperBlocksError {
        kind: "task_failed".to_string(),
        message: format!("Task panicked: {error}"),
        paper_id: error_paper_id,
        path: String::new(),
        line_errors: vec![],
    })?
}

#[tauri::command]
pub async fn read_paper_block(
    vault_path: PathBuf,
    paper_id: String,
    block_id: String,
) -> Result<PaperBlockLookupResult, PaperBlocksError> {
    let error_paper_id = paper_id.clone();
    tokio::task::spawn_blocking(move || {
        let blocks_path = blocks_path_for_paper(&vault_path, &paper_id)?;
        paper::find_paper_block(&paper_id, &blocks_path, &block_id)
    })
    .await
    .map_err(|error| PaperBlocksError {
        kind: "task_failed".to_string(),
        message: format!("Task panicked: {error}"),
        paper_id: error_paper_id,
        path: String::new(),
        line_errors: vec![],
    })?
}

#[tauri::command]
pub async fn search_paper_blocks(
    vault_path: PathBuf,
    paper_id: String,
    query: String,
) -> Result<PaperBlockSearchResult, PaperBlocksError> {
    let error_paper_id = paper_id.clone();
    tokio::task::spawn_blocking(move || {
        let blocks_path = blocks_path_for_paper(&vault_path, &paper_id)?;
        paper::search_paper_blocks_file(&paper_id, &blocks_path, &query)
    })
    .await
    .map_err(|error| PaperBlocksError {
        kind: "task_failed".to_string(),
        message: format!("Task panicked: {error}"),
        paper_id: error_paper_id,
        path: String::new(),
        line_errors: vec![],
    })?
}

#[tauri::command]
pub async fn read_paper_pdf_outline(
    vault_path: PathBuf,
    paper_id: String,
) -> Result<PaperPdfOutlineReadResult, String> {
    tokio::task::spawn_blocking(move || {
        let source_pdf_path = source_pdf_path_for_paper(&vault_path, &paper_id)?;
        Ok(paper::read_paper_pdf_outline_file(
            &paper_id,
            &source_pdf_path,
        ))
    })
    .await
    .map_err(|error| format!("Task panicked: {error}"))?
}

#[tauri::command]
pub async fn parse_paper(
    vault_path: PathBuf,
    paper_id: String,
    settings: PaperParserSettings,
) -> Result<PaperParseResult, PaperParseError> {
    let error_paper_id = paper_id.clone();
    let error_provider = settings.provider.clone();
    tokio::task::spawn_blocking(move || {
        let paths = parse_paths_for_paper(&vault_path, &paper_id, settings.provider.clone())?;
        paper::parse_paper_bundle(
            &paper_id,
            &paths.paper_note,
            &paths.source_pdf,
            &paths.blocks,
            settings,
        )
    })
    .await
    .map_err(|error| PaperParseError {
        kind: "task_failed".to_string(),
        message: format!("Task panicked: {error}"),
        paper_id: error_paper_id,
        provider: error_provider,
        path: String::new(),
    })?
}

#[tauri::command]
pub async fn read_paper_annotations(
    vault_path: PathBuf,
    paper_id: String,
) -> Result<PaperAnnotationsReadResult, PaperAnnotationsError> {
    let error_paper_id = paper_id.clone();
    tokio::task::spawn_blocking(move || {
        let annotations_path = annotations_path_for_paper(&vault_path, &paper_id)?;
        paper::read_paper_annotations_file(&paper_id, &annotations_path)
    })
    .await
    .map_err(|error| PaperAnnotationsError {
        kind: "task_failed".to_string(),
        message: format!("Task panicked: {error}"),
        paper_id: error_paper_id,
        path: String::new(),
        line_errors: vec![],
    })?
}

#[tauri::command]
pub async fn save_paper_annotation(
    vault_path: PathBuf,
    paper_id: String,
    annotation: PaperAnnotation,
) -> Result<PaperAnnotationsReadResult, PaperAnnotationsError> {
    let error_paper_id = paper_id.clone();
    tokio::task::spawn_blocking(move || {
        let annotations_path = annotations_path_for_paper(&vault_path, &paper_id)?;
        paper::save_paper_annotation_file(&paper_id, &annotations_path, annotation)
    })
    .await
    .map_err(|error| PaperAnnotationsError {
        kind: "task_failed".to_string(),
        message: format!("Task panicked: {error}"),
        paper_id: error_paper_id,
        path: String::new(),
        line_errors: vec![],
    })?
}

#[tauri::command]
pub async fn delete_paper_annotation(
    vault_path: PathBuf,
    paper_id: String,
    annotation_id: String,
) -> Result<PaperAnnotationsReadResult, PaperAnnotationsError> {
    let error_paper_id = paper_id.clone();
    tokio::task::spawn_blocking(move || {
        let annotations_path = annotations_path_for_paper(&vault_path, &paper_id)?;
        paper::delete_paper_annotation_file(&paper_id, &annotations_path, &annotation_id)
    })
    .await
    .map_err(|error| PaperAnnotationsError {
        kind: "task_failed".to_string(),
        message: format!("Task panicked: {error}"),
        paper_id: error_paper_id,
        path: String::new(),
        line_errors: vec![],
    })?
}

#[tauri::command]
pub async fn reset_paper_annotations(
    vault_path: PathBuf,
    paper_id: String,
) -> Result<PaperAnnotationsReadResult, PaperAnnotationsError> {
    let error_paper_id = paper_id.clone();
    tokio::task::spawn_blocking(move || {
        let annotations_path = annotations_path_for_paper(&vault_path, &paper_id)?;
        paper::reset_paper_annotations_file(&paper_id, &annotations_path)
    })
    .await
    .map_err(|error| PaperAnnotationsError {
        kind: "task_failed".to_string(),
        message: format!("Task panicked: {error}"),
        paper_id: error_paper_id,
        path: String::new(),
        line_errors: vec![],
    })?
}

fn blocks_path_for_paper(vault_path: &Path, paper_id: &str) -> Result<PathBuf, PaperBlocksError> {
    let expanded_vault_path = expand_tilde(vault_path.to_string_lossy().as_ref()).into_owned();
    let boundary = VaultBoundary::from_request(Some(&expanded_vault_path))
        .map_err(|error| PaperBlocksError::boundary(paper_id, error))?;
    paper_bundle_dir_for_paper(&boundary, paper_id)
        .map(|bundle_dir| bundle_dir.join("blocks.jsonl"))
        .map_err(|error| PaperBlocksError::boundary(paper_id, error))
}

fn source_pdf_path_for_paper(vault_path: &Path, paper_id: &str) -> Result<PathBuf, String> {
    let expanded_vault_path = expand_tilde(vault_path.to_string_lossy().as_ref()).into_owned();
    let boundary = VaultBoundary::from_request(Some(&expanded_vault_path))
        .map_err(|error| error.to_string())?;
    paper_bundle_dir_for_paper(&boundary, paper_id).map(|bundle_dir| bundle_dir.join("source.pdf"))
}

struct PaperParsePaths {
    paper_note: PathBuf,
    source_pdf: PathBuf,
    blocks: PathBuf,
}

fn parse_paths_for_paper(
    vault_path: &Path,
    paper_id: &str,
    provider: PaperParserProvider,
) -> Result<PaperParsePaths, PaperParseError> {
    let expanded_vault_path = expand_tilde(vault_path.to_string_lossy().as_ref()).into_owned();
    let boundary = VaultBoundary::from_request(Some(&expanded_vault_path))
        .map_err(|error| PaperParseError::boundary(paper_id, provider.clone(), error))?;

    let bundle_dir = paper_bundle_dir_for_paper(&boundary, paper_id)
        .map_err(|error| PaperParseError::boundary(paper_id, provider.clone(), error))?;
    let paper_note = bundle_dir.join("paper.md");
    let source_pdf = bundle_dir.join("source.pdf");
    let blocks = bundle_dir.join("blocks.jsonl");

    Ok(PaperParsePaths {
        paper_note,
        source_pdf,
        blocks,
    })
}

fn annotations_path_for_paper(
    vault_path: &Path,
    paper_id: &str,
) -> Result<PathBuf, PaperAnnotationsError> {
    let expanded_vault_path = expand_tilde(vault_path.to_string_lossy().as_ref()).into_owned();
    let boundary = VaultBoundary::from_request(Some(&expanded_vault_path))
        .map_err(|error| PaperAnnotationsError::boundary(paper_id, error))?;
    paper_bundle_dir_for_paper(&boundary, paper_id)
        .map(|bundle_dir| bundle_dir.join("annotations.jsonl"))
        .map_err(|error| PaperAnnotationsError::boundary(paper_id, error))
}

fn paper_bundle_dir_for_paper(boundary: &VaultBoundary, paper_id: &str) -> Result<PathBuf, String> {
    let default_paper_note = boundary.child_path(&format!("papers/{paper_id}/paper.md"))?;
    if default_paper_note.exists() {
        return Ok(default_paper_note
            .parent()
            .unwrap_or_else(|| boundary.requested_root())
            .to_path_buf());
    }

    if let Some(found_paper_note) = find_paper_note_by_id(boundary.requested_root(), paper_id)? {
        return Ok(found_paper_note
            .parent()
            .unwrap_or_else(|| boundary.requested_root())
            .to_path_buf());
    }

    Ok(default_paper_note
        .parent()
        .unwrap_or_else(|| boundary.requested_root())
        .to_path_buf())
}

fn find_paper_note_by_id(root: &Path, paper_id: &str) -> Result<Option<PathBuf>, String> {
    let mut pending = VecDeque::from([root.to_path_buf()]);
    while let Some(directory) = pending.pop_front() {
        let entries = fs::read_dir(&directory).map_err(|error| {
            format!(
                "Failed to scan Paper bundles under {}: {error}",
                directory.display()
            )
        })?;

        for entry in entries {
            let entry = entry.map_err(|error| {
                format!(
                    "Failed to scan Paper bundles under {}: {error}",
                    directory.display()
                )
            })?;
            let file_type = entry.file_type().map_err(|error| {
                format!(
                    "Failed to inspect Paper bundle candidate {}: {error}",
                    entry.path().display()
                )
            })?;
            let path = entry.path();
            if file_type.is_dir() {
                pending.push_back(path);
                continue;
            }
            if !file_type.is_file() || entry.file_name().to_string_lossy() != "paper.md" {
                continue;
            }
            if paper_note_matches_id(path.as_path(), paper_id)? {
                return Ok(Some(path));
            }
        }
    }
    Ok(None)
}

fn paper_note_matches_id(path: &Path, paper_id: &str) -> Result<bool, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read Paper note {}: {error}", path.display()))?;
    Ok(frontmatter_string_value(&content, "paper_id").as_deref() == Some(paper_id))
}

fn frontmatter_string_value(content: &str, key: &str) -> Option<String> {
    let mut lines = content.lines();
    if lines.next()? != "---" {
        return None;
    }
    for line in lines {
        if line.trim() == "---" {
            return None;
        }
        if let Some((candidate_key, raw_value)) = line.split_once(':') {
            if candidate_key.trim() == key {
                return Some(
                    raw_value
                        .trim()
                        .trim_matches('"')
                        .trim_matches('\'')
                        .to_string(),
                );
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write_blocks_in(vault: &Path, bundle_parent: &str, paper_id: &str, content: &str) {
        let paper_dir = vault.join(bundle_parent).join("papers").join(paper_id);
        fs::create_dir_all(&paper_dir).unwrap();
        fs::write(paper_dir.join("blocks.jsonl"), content).unwrap();
    }

    fn write_blocks(vault: &Path, paper_id: &str, content: &str) {
        write_blocks_in(vault, "", paper_id, content);
    }

    fn write_paper_bundle_in(vault: &Path, bundle_parent: &str, paper_id: &str) {
        let paper_dir = vault.join(bundle_parent).join("papers").join(paper_id);
        fs::create_dir_all(&paper_dir).unwrap();
        fs::write(paper_dir.join("source.pdf"), b"%PDF-1.7 fixture").unwrap();
        fs::write(
            paper_dir.join("paper.md"),
            format!(
                "---\ntype: Paper\npaper_id: {paper_id}\ntitle: Fixture Paper\nparse_status: unparsed\nsource_pdf: source.pdf\nblocks: blocks.jsonl\nannotations: annotations.jsonl\n---\n# Fixture Paper\n"
            ),
        )
        .unwrap();
    }

    fn write_paper_bundle(vault: &Path, paper_id: &str) {
        write_paper_bundle_in(vault, "", paper_id);
    }

    fn write_annotations_in(vault: &Path, bundle_parent: &str, paper_id: &str, content: &str) {
        let paper_dir = vault.join(bundle_parent).join("papers").join(paper_id);
        fs::create_dir_all(&paper_dir).unwrap();
        fs::write(paper_dir.join("annotations.jsonl"), content).unwrap();
    }

    fn write_annotations(vault: &Path, paper_id: &str, content: &str) {
        write_annotations_in(vault, "", paper_id, content);
    }

    #[tokio::test]
    async fn read_paper_blocks_uses_active_vault_boundary() {
        let vault = TempDir::new().unwrap();

        let error = read_paper_blocks(vault.path().to_path_buf(), "../outside".to_string())
            .await
            .expect_err("expected traversal to be rejected");

        assert_eq!(error.kind, "active_vault_boundary");
    }

    #[tokio::test]
    async fn read_paper_annotations_uses_active_vault_boundary() {
        let vault = TempDir::new().unwrap();

        let error = read_paper_annotations(vault.path().to_path_buf(), "../outside".to_string())
            .await
            .expect_err("expected traversal to be rejected");

        assert_eq!(error.kind, "active_vault_boundary");
    }

    #[tokio::test]
    async fn read_paper_pdf_outline_uses_active_vault_boundary() {
        let vault = TempDir::new().unwrap();

        let error = read_paper_pdf_outline(vault.path().to_path_buf(), "../outside".to_string())
            .await
            .expect_err("expected traversal to be rejected");

        assert!(error.contains("Path must stay inside the active vault"));
    }

    #[tokio::test]
    async fn read_paper_pdf_outline_reports_missing_source_pdf() {
        let vault = TempDir::new().unwrap();
        let paper_dir = vault.path().join("papers/paper-1");
        fs::create_dir_all(&paper_dir).unwrap();
        fs::write(
            paper_dir.join("paper.md"),
            "---\ntype: Paper\npaper_id: paper-1\nsource_pdf: source.pdf\n---\n# Paper\n",
        )
        .unwrap();

        let result = read_paper_pdf_outline(vault.path().to_path_buf(), "paper-1".to_string())
            .await
            .unwrap();

        assert_eq!(result.state, paper::PaperPdfOutlineState::Missing);
        assert!(result.items.is_empty());
    }

    #[tokio::test]
    async fn read_and_search_paper_blocks_from_vault() {
        let vault = TempDir::new().unwrap();
        write_blocks(
            vault.path(),
            "paper-1",
            &paper::sample_blocks_jsonl("paper-1"),
        );

        let read = read_paper_blocks(vault.path().to_path_buf(), "paper-1".to_string())
            .await
            .unwrap();
        assert_eq!(read.blocks.len(), 2);

        let block = read_paper_block(
            vault.path().to_path_buf(),
            "paper-1".to_string(),
            "b0002".to_string(),
        )
        .await
        .unwrap();
        assert_eq!(block.block.unwrap().id, "b0002");

        let search = search_paper_blocks(
            vault.path().to_path_buf(),
            "paper-1".to_string(),
            "parallelization".to_string(),
        )
        .await
        .unwrap();
        assert_eq!(search.blocks.len(), 1);
    }

    #[tokio::test]
    async fn read_paper_blocks_finds_nested_workspace_paper_bundle_by_paper_id() {
        let vault = TempDir::new().unwrap();
        write_blocks_in(
            vault.path(),
            "test",
            "paper-1",
            &paper::sample_blocks_jsonl("paper-1"),
        );
        write_paper_bundle_in(vault.path(), "test", "paper-1");

        let read = read_paper_blocks(vault.path().to_path_buf(), "paper-1".to_string())
            .await
            .unwrap();

        assert_eq!(
            read.path,
            vault.path().join("test/papers/paper-1/blocks.jsonl")
        );
        assert_eq!(read.blocks.len(), 2);
    }

    #[tokio::test]
    async fn parse_paper_dev_fixture_writes_blocks_and_updates_metadata() {
        let vault = TempDir::new().unwrap();
        write_paper_bundle(vault.path(), "paper-1");

        let result = parse_paper(
            vault.path().to_path_buf(),
            "paper-1".to_string(),
            paper::PaperParserSettings {
                mineru_token_ref: None,
                provider: paper::PaperParserProvider::DevFixture,
            },
        )
        .await
        .unwrap();

        assert_eq!(result.provider, paper::PaperParserProvider::DevFixture);
        assert_eq!(result.blocks.len(), 2);
        assert!(vault.path().join("papers/paper-1/blocks.jsonl").exists());
        let paper = fs::read_to_string(vault.path().join("papers/paper-1/paper.md")).unwrap();
        assert!(paper.contains("parse_status: parsed"));
        assert!(paper.contains("parser_provider: dev-fixture"));
        assert_eq!(
            fs::read(vault.path().join("papers/paper-1/source.pdf")).unwrap(),
            b"%PDF-1.7 fixture"
        );
    }

    #[tokio::test]
    async fn parse_paper_finds_nested_workspace_paper_bundle_by_paper_id() {
        let vault = TempDir::new().unwrap();
        write_paper_bundle_in(vault.path(), "test", "paper-1");

        let result = parse_paper(
            vault.path().to_path_buf(),
            "paper-1".to_string(),
            paper::PaperParserSettings {
                mineru_token_ref: None,
                provider: paper::PaperParserProvider::DevFixture,
            },
        )
        .await
        .unwrap();

        assert_eq!(
            result.paper_path,
            vault.path().join("test/papers/paper-1/paper.md")
        );
        assert!(vault
            .path()
            .join("test/papers/paper-1/blocks.jsonl")
            .exists());
        let paper = fs::read_to_string(vault.path().join("test/papers/paper-1/paper.md")).unwrap();
        assert!(paper.contains("parse_status: parsed"));
    }

    #[tokio::test]
    async fn parse_paper_reports_missing_provider_and_mineru_config() {
        let vault = TempDir::new().unwrap();
        write_paper_bundle(vault.path(), "paper-1");

        let missing_provider = parse_paper(
            vault.path().to_path_buf(),
            "paper-1".to_string(),
            paper::PaperParserSettings {
                mineru_token_ref: None,
                provider: paper::PaperParserProvider::None,
            },
        )
        .await
        .expect_err("expected missing parser provider");
        assert_eq!(missing_provider.kind, "missing_provider");

        let missing_config = parse_paper(
            vault.path().to_path_buf(),
            "paper-1".to_string(),
            paper::PaperParserSettings {
                mineru_token_ref: None,
                provider: paper::PaperParserProvider::Mineru,
            },
        )
        .await
        .expect_err("expected missing MinerU config");
        assert_eq!(missing_config.kind, "missing_config");
    }

    #[tokio::test]
    async fn reads_saves_and_deletes_paper_annotations_from_vault() {
        let vault = TempDir::new().unwrap();
        write_annotations(
            vault.path(),
            "paper-1",
            "{\"id\":\"ann-1\",\"paper_id\":\"paper-1\",\"block_id\":\"b0002\",\"kind\":\"highlight\",\"color\":\"important\",\"created_at\":\"2026-07-02T10:15:00Z\"}\n",
        );

        let read = read_paper_annotations(vault.path().to_path_buf(), "paper-1".to_string())
            .await
            .unwrap();
        assert_eq!(read.annotations.len(), 1);

        let mut annotation = read.annotations[0].clone();
        annotation.kind = paper::PaperAnnotationKind::Question;
        annotation.note = Some("Why?".to_string());

        let saved = save_paper_annotation(
            vault.path().to_path_buf(),
            "paper-1".to_string(),
            annotation,
        )
        .await
        .unwrap();
        assert_eq!(saved.annotations.len(), 1);
        assert_eq!(
            saved.annotations[0].kind,
            paper::PaperAnnotationKind::Question
        );

        let deleted = delete_paper_annotation(
            vault.path().to_path_buf(),
            "paper-1".to_string(),
            "ann-1".to_string(),
        )
        .await
        .unwrap();
        assert_eq!(deleted.annotations.len(), 0);
    }

    #[tokio::test]
    async fn resets_paper_annotations_from_vault() {
        let vault = TempDir::new().unwrap();
        write_annotations(vault.path(), "paper-1", "{not json}\n");

        let reset = reset_paper_annotations(vault.path().to_path_buf(), "paper-1".to_string())
            .await
            .unwrap();

        assert_eq!(reset.state, paper::PaperAnnotationsState::Empty);
        assert_eq!(reset.annotations.len(), 0);
        assert_eq!(
            fs::read_to_string(vault.path().join("papers/paper-1/annotations.jsonl")).unwrap(),
            ""
        );
    }

    #[tokio::test]
    async fn read_paper_annotations_finds_nested_workspace_paper_bundle_by_paper_id() {
        let vault = TempDir::new().unwrap();
        write_paper_bundle_in(vault.path(), "test", "paper-1");
        write_annotations_in(
            vault.path(),
            "test",
            "paper-1",
            "{\"id\":\"ann-1\",\"paper_id\":\"paper-1\",\"block_id\":\"b0001\",\"kind\":\"bookmark\",\"created_at\":\"2026-07-02T10:15:00Z\"}\n",
        );

        let read = read_paper_annotations(vault.path().to_path_buf(), "paper-1".to_string())
            .await
            .unwrap();

        assert_eq!(
            read.path,
            vault.path().join("test/papers/paper-1/annotations.jsonl")
        );
        assert_eq!(read.annotations.len(), 1);
    }
}
