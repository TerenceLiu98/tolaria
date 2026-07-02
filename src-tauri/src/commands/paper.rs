use std::path::{Path, PathBuf};

use crate::commands::expand_tilde;
use crate::paper::{self, ImportPaperPdfResult};

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
