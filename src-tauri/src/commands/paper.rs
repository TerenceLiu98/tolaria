use std::path::{Path, PathBuf};

use super::vault::VaultBoundary;
use crate::commands::expand_tilde;
use crate::paper::{
    self, ImportPaperPdfResult, PaperAnnotation, PaperAnnotationsError, PaperAnnotationsReadResult,
    PaperBlockLookupResult, PaperBlockSearchResult, PaperBlocksError, PaperBlocksReadResult,
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
    boundary
        .child_path(&format!("papers/{paper_id}/blocks.jsonl"))
        .map_err(|error| PaperBlocksError::boundary(paper_id, error))
}

fn annotations_path_for_paper(
    vault_path: &Path,
    paper_id: &str,
) -> Result<PathBuf, PaperAnnotationsError> {
    let expanded_vault_path = expand_tilde(vault_path.to_string_lossy().as_ref()).into_owned();
    let boundary = VaultBoundary::from_request(Some(&expanded_vault_path))
        .map_err(|error| PaperAnnotationsError::boundary(paper_id, error))?;
    boundary
        .child_path(&format!("papers/{paper_id}/annotations.jsonl"))
        .map_err(|error| PaperAnnotationsError::boundary(paper_id, error))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write_blocks(vault: &Path, paper_id: &str, content: &str) {
        let paper_dir = vault.join("papers").join(paper_id);
        fs::create_dir_all(&paper_dir).unwrap();
        fs::write(paper_dir.join("blocks.jsonl"), content).unwrap();
    }

    fn write_annotations(vault: &Path, paper_id: &str, content: &str) {
        let paper_dir = vault.join("papers").join(paper_id);
        fs::create_dir_all(&paper_dir).unwrap();
        fs::write(paper_dir.join("annotations.jsonl"), content).unwrap();
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
        assert_eq!(saved.annotations[0].kind, paper::PaperAnnotationKind::Question);

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
}
