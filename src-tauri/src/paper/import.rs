use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

use super::paths::{
    is_pdf_path, paper_bundle_paths, paper_title_from_source_path, unique_paper_slug,
    ANNOTATIONS_FILENAME, BLOCKS_FILENAME, PAPER_NOTE_FILENAME, SOURCE_PDF_FILENAME,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPaperPdfResult {
    pub paper_id: String,
    pub title: String,
    pub paper_path: PathBuf,
    pub source_pdf_path: PathBuf,
    pub blocks_path: PathBuf,
    pub annotations_path: PathBuf,
    pub created_files: Vec<String>,
    pub deduplicated: bool,
}

pub fn import_paper_pdf(
    vault_path: &Path,
    source_path: &Path,
) -> Result<ImportPaperPdfResult, String> {
    validate_import_inputs(vault_path, source_path)?;

    let title = paper_title_from_source_path(source_path);
    let base_slug = super::paths::normalize_paper_slug(&title);
    let paper_id = unique_paper_slug(vault_path, &base_slug);
    let deduplicated = paper_id != base_slug;
    let paths = paper_bundle_paths(vault_path, &paper_id);

    fs::create_dir_all(&paths.paper_dir)
        .map_err(|error| format!("Failed to create paper folder: {error}"))?;
    fs::copy(source_path, &paths.source_pdf)
        .map_err(|error| format!("Failed to copy PDF into the vault: {error}"))?;
    fs::write(&paths.paper_note, build_paper_markdown(&paper_id, &title))
        .map_err(|error| format!("Failed to create paper note: {error}"))?;

    Ok(ImportPaperPdfResult {
        paper_id: paper_id.clone(),
        title,
        paper_path: paths.paper_note,
        source_pdf_path: paths.source_pdf,
        blocks_path: paths.blocks,
        annotations_path: paths.annotations,
        created_files: vec![
            format!("papers/{paper_id}/{SOURCE_PDF_FILENAME}"),
            format!("papers/{paper_id}/{PAPER_NOTE_FILENAME}"),
        ],
        deduplicated,
    })
}

fn validate_import_inputs(vault_path: &Path, source_path: &Path) -> Result<(), String> {
    if !vault_path.is_dir() {
        return Err(format!(
            "Vault path is not a directory: {}",
            vault_path.display()
        ));
    }

    if !source_path.is_file() {
        return Err(format!(
            "PDF source does not exist: {}",
            source_path.display()
        ));
    }

    if !is_pdf_path(source_path) {
        return Err("Only PDF files can be imported as Papers".to_string());
    }

    Ok(())
}

fn yaml_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn build_paper_markdown(paper_id: &str, title: &str) -> String {
    format!(
        "---\n\
type: Paper\n\
paper_id: {paper_id}\n\
title: {}\n\
status: imported\n\
parse_status: unparsed\n\
source_pdf: {SOURCE_PDF_FILENAME}\n\
blocks: {BLOCKS_FILENAME}\n\
annotations: {ANNOTATIONS_FILENAME}\n\
---\n\
# {title}\n\n\
## Summary\n\n\
## Key Claims\n\n\
## Questions\n",
        yaml_string(title)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn imports_pdf_as_paper_bundle_without_mutating_source() {
        let vault = TempDir::new().unwrap();
        let source_dir = TempDir::new().unwrap();
        let source = source_dir.path().join("Attention Is All You Need.pdf");
        fs::write(&source, b"%PDF-1.7 source bytes").unwrap();

        let result = import_paper_pdf(vault.path(), &source).unwrap();

        assert_eq!(result.paper_id, "attention-is-all-you-need");
        assert_eq!(result.title, "Attention Is All You Need");
        assert!(result
            .paper_path
            .ends_with("papers/attention-is-all-you-need/paper.md"));
        assert!(result
            .source_pdf_path
            .ends_with("papers/attention-is-all-you-need/source.pdf"));
        assert_eq!(fs::read(&source).unwrap(), b"%PDF-1.7 source bytes");
        assert_eq!(
            fs::read(&result.source_pdf_path).unwrap(),
            b"%PDF-1.7 source bytes"
        );

        let paper = fs::read_to_string(&result.paper_path).unwrap();
        assert!(paper.contains("type: Paper"));
        assert!(paper.contains("paper_id: attention-is-all-you-need"));
        assert!(paper.contains("source_pdf: source.pdf"));
        assert!(paper.contains("blocks: blocks.jsonl"));
        assert!(paper.contains("annotations: annotations.jsonl"));
        assert!(!result.blocks_path.exists());
        assert!(!result.annotations_path.exists());
    }

    #[test]
    fn creates_unique_bundle_when_importing_same_pdf_twice() {
        let vault = TempDir::new().unwrap();
        let source = vault.path().join("paper.pdf");
        fs::write(&source, b"pdf").unwrap();

        let first = import_paper_pdf(vault.path(), &source).unwrap();
        let second = import_paper_pdf(vault.path(), &source).unwrap();

        assert_eq!(first.paper_id, "paper");
        assert_eq!(second.paper_id, "paper-2");
        assert!(!first.deduplicated);
        assert!(second.deduplicated);
    }

    #[test]
    fn rejects_non_pdf_sources() {
        let vault = TempDir::new().unwrap();
        let source = vault.path().join("paper.txt");
        fs::write(&source, "not pdf").unwrap();

        let error = import_paper_pdf(vault.path(), &source).unwrap_err();

        assert!(error.contains("Only PDF files"));
    }
}
