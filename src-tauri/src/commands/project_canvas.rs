use std::path::{Path, PathBuf};

use super::vault::VaultBoundary;
use crate::commands::expand_tilde;
use crate::project_canvas::{
    self, ProjectCanvas, ProjectCanvasPaths, ProjectCanvasReadResult, ProjectCanvasResolveResult,
};

#[tauri::command]
pub async fn read_project_canvas(
    vault_path: PathBuf,
    project_path: String,
) -> Result<ProjectCanvasReadResult, String> {
    tokio::task::spawn_blocking(move || {
        let root = requested_vault_root(&vault_path)?;
        project_canvas::read_project_canvas_file(&root, &project_path)
    })
    .await
    .map_err(|error| format!("Task panicked: {error}"))?
}

#[tauri::command]
pub async fn save_project_canvas(
    vault_path: PathBuf,
    project_path: String,
    canvas: ProjectCanvas,
) -> Result<ProjectCanvasReadResult, String> {
    tokio::task::spawn_blocking(move || {
        project_canvas::validate_project_canvas(&canvas)?;
        let root = requested_vault_root(&vault_path)?;
        project_canvas::save_project_canvas_file(&root, &project_path, canvas)
    })
    .await
    .map_err(|error| format!("Task panicked: {error}"))?
}

#[tauri::command]
pub async fn create_project_canvas(
    vault_path: PathBuf,
    project_path: String,
) -> Result<ProjectCanvasReadResult, String> {
    tokio::task::spawn_blocking(move || {
        let root = requested_vault_root(&vault_path)?;
        project_canvas::create_project_canvas_file(&root, &project_path)
    })
    .await
    .map_err(|error| format!("Task panicked: {error}"))?
}

#[tauri::command]
pub async fn resolve_project_canvas_refs(
    vault_path: PathBuf,
    project_path: String,
    canvas: ProjectCanvas,
) -> Result<ProjectCanvasResolveResult, String> {
    tokio::task::spawn_blocking(move || {
        let root = requested_vault_root(&vault_path)?;
        project_canvas::resolve_project_canvas_refs_file(&root, &project_path, &canvas)
    })
    .await
    .map_err(|error| format!("Task panicked: {error}"))?
}

#[tauri::command]
pub async fn project_canvas_paths(
    vault_path: PathBuf,
    project_path: String,
) -> Result<ProjectCanvasPaths, String> {
    tokio::task::spawn_blocking(move || {
        let root = requested_vault_root(&vault_path)?;
        project_canvas::project_canvas_paths(&root, &project_path)
    })
    .await
    .map_err(|error| format!("Task panicked: {error}"))?
}

fn requested_vault_root(vault_path: &Path) -> Result<PathBuf, String> {
    let expanded_vault_path = expand_tilde(vault_path.to_string_lossy().as_ref()).into_owned();
    let boundary = VaultBoundary::from_request(Some(&expanded_vault_path))?;
    Ok(boundary.requested_root().to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project_canvas::{
        ProjectCanvasEdge, ProjectCanvasEdgeKind, ProjectCanvasNode, ProjectCanvasNodeType,
        ProjectCanvasRefState,
    };
    use std::fs;
    use tempfile::TempDir;

    fn write_project(dir: &TempDir, relative_path: &str) {
        let path = dir.path().join(relative_path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "---\ntype: Project\ntitle: Alpha\n---\n# Alpha\n").unwrap();
    }

    fn write_note(dir: &TempDir, relative_path: &str, note_type: &str, title: &str) {
        let path = dir.path().join(relative_path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            path,
            format!("---\ntype: {note_type}\ntitle: {title}\n---\n# {title}\n"),
        )
        .unwrap();
    }

    #[tokio::test]
    async fn project_canvas_commands_roundtrip_and_resolve_refs() {
        let dir = TempDir::new().unwrap();
        write_project(&dir, "projects/alpha/project.md");
        write_note(&dir, "notes/question.md", "Note", "Question");

        let created = create_project_canvas(
            dir.path().to_path_buf(),
            "projects/alpha/project.md".to_string(),
        )
        .await
        .unwrap();
        assert_eq!(created.canvas_path, "projects/alpha/project.canvas.json");

        let paths = project_canvas_paths(
            dir.path().to_path_buf(),
            "projects/alpha/project.md".to_string(),
        )
        .await
        .unwrap();
        assert_eq!(paths.project_path, "projects/alpha/project.md");
        assert_eq!(paths.canvas_path, "projects/alpha/project.canvas.json");

        let mut canvas = created.canvas.unwrap();
        canvas.nodes = vec![
            ProjectCanvasNode {
                id: "node_text".to_string(),
                node_type: ProjectCanvasNodeType::Text,
                ref_target: None,
                x: 10.0,
                y: 20.0,
                width: 200.0,
                height: 120.0,
                title: Some("Claim".to_string()),
                text: Some("Needs evidence".to_string()),
                completed: None,
                z_index: None,
                parent_id: None,
            },
            ProjectCanvasNode {
                id: "node_note".to_string(),
                node_type: ProjectCanvasNodeType::Note,
                ref_target: Some("notes/question.md".to_string()),
                x: 240.0,
                y: 20.0,
                width: 260.0,
                height: 160.0,
                title: None,
                text: None,
                completed: None,
                z_index: None,
                parent_id: None,
            },
        ];
        canvas.edges = vec![ProjectCanvasEdge {
            id: "edge_1".to_string(),
            from: "node_note".to_string(),
            to: "node_text".to_string(),
            kind: ProjectCanvasEdgeKind::Supports,
            note: None,
            routing: None,
            label: None,
            stroke_style: None,
            stroke_width: None,
            from_marker: None,
            to_marker: None,
        }];

        let saved = save_project_canvas(
            dir.path().to_path_buf(),
            "projects/alpha/project.md".to_string(),
            canvas.clone(),
        )
        .await
        .unwrap();
        assert_eq!(saved.canvas.unwrap().edges.len(), 1);

        let read = read_project_canvas(
            dir.path().to_path_buf(),
            "projects/alpha/project.md".to_string(),
        )
        .await
        .unwrap();
        assert_eq!(read.canvas.unwrap().nodes.len(), 3);

        let resolved = resolve_project_canvas_refs(
            dir.path().to_path_buf(),
            "projects/alpha/project.md".to_string(),
            canvas,
        )
        .await
        .unwrap();
        assert!(resolved.refs.iter().any(
            |item| item.node_id == "node_note" && item.state == ProjectCanvasRefState::Resolved
        ));
        assert!(resolved.diagnostics.is_empty());
    }

    #[tokio::test]
    async fn project_canvas_commands_reject_non_project_notes() {
        let dir = TempDir::new().unwrap();
        write_note(&dir, "notes/plain.md", "Note", "Plain");

        let error = create_project_canvas(dir.path().to_path_buf(), "notes/plain.md".to_string())
            .await
            .unwrap_err();
        assert!(error.contains("type: Project"));
    }
}
