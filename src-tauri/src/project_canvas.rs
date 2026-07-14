use crate::paper::{read_paper_blocks_file, PaperBlocksState};
use crate::vault::{scan_vault, VaultEntry};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

pub const PROJECT_CANVAS_FILENAME: &str = "project.canvas.json";
pub const PROJECT_CANVAS_EXTENSION: &str = "canvas.json";
pub const PROJECT_CANVAS_SCHEMA: &str = "project-canvas/v1";
pub const PROJECT_OVERVIEW_NODE_ID: &str = "project_overview";
const PROJECT_OVERVIEW_WIDTH: f64 = 420.0;
const PROJECT_OVERVIEW_HEIGHT: f64 = 280.0;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectCanvasNodeType {
    Note,
    Paper,
    PaperBlock,
    Image,
    Text,
    Task,
    Group,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectCanvasEdgeKind {
    Related,
    Supports,
    Contradicts,
    DependsOn,
    NeedsReading,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectCanvasEdgeRouting {
    Straight,
    Orthogonal,
    Curved,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCanvasViewport {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

impl Default for ProjectCanvasViewport {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            zoom: 1.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCanvasNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: ProjectCanvasNodeType,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "ref")]
    pub ref_target: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCanvasEdge {
    pub id: String,
    pub from: String,
    pub to: String,
    pub kind: ProjectCanvasEdgeKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub routing: Option<ProjectCanvasEdgeRouting>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCanvasSapientiaMetadata {
    pub schema: String,
}

impl Default for ProjectCanvasSapientiaMetadata {
    fn default() -> Self {
        Self {
            schema: PROJECT_CANVAS_SCHEMA.to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCanvas {
    pub version: u32,
    pub project: String,
    pub viewport: ProjectCanvasViewport,
    pub nodes: Vec<ProjectCanvasNode>,
    pub edges: Vec<ProjectCanvasEdge>,
    pub sapientia: ProjectCanvasSapientiaMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectCanvasState {
    Missing,
    Ready,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCanvasPaths {
    pub project_path: String,
    pub canvas_path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCanvasReadResult {
    pub project_path: String,
    pub canvas_path: String,
    pub state: ProjectCanvasState,
    pub canvas: Option<ProjectCanvas>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectCanvasRefState {
    Embedded,
    Resolved,
    Stale,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCanvasResolvedRef {
    pub node_id: String,
    pub node_type: ProjectCanvasNodeType,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "ref")]
    pub ref_target: Option<String>,
    pub state: ProjectCanvasRefState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCanvasRefDiagnostic {
    pub node_id: String,
    pub kind: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "ref")]
    pub ref_target: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCanvasResolveResult {
    pub project_path: String,
    pub canvas_path: String,
    pub refs: Vec<ProjectCanvasResolvedRef>,
    pub diagnostics: Vec<ProjectCanvasRefDiagnostic>,
}

pub fn default_project_canvas(project_path: &str) -> ProjectCanvas {
    ProjectCanvas {
        version: 1,
        project: project_path.to_string(),
        viewport: ProjectCanvasViewport::default(),
        nodes: vec![project_overview_node(project_path)],
        edges: vec![],
        sapientia: ProjectCanvasSapientiaMetadata::default(),
    }
}

pub fn normalize_project_canvas(mut canvas: ProjectCanvas, project_path: &str) -> ProjectCanvas {
    canvas.version = 1;
    canvas.project = project_path.to_string();
    if canvas.viewport.zoom <= 0.0 || !canvas.viewport.zoom.is_finite() {
        canvas.viewport.zoom = 1.0;
    }
    if !canvas.viewport.x.is_finite() {
        canvas.viewport.x = 0.0;
    }
    if !canvas.viewport.y.is_finite() {
        canvas.viewport.y = 0.0;
    }
    canvas.sapientia.schema = PROJECT_CANVAS_SCHEMA.to_string();
    ensure_project_overview_node(&mut canvas.nodes, project_path);
    canvas.nodes.sort_by(|left, right| left.id.cmp(&right.id));
    canvas.edges.sort_by(|left, right| left.id.cmp(&right.id));
    canvas
}

fn project_overview_node(project_path: &str) -> ProjectCanvasNode {
    ProjectCanvasNode {
        id: PROJECT_OVERVIEW_NODE_ID.to_string(),
        node_type: ProjectCanvasNodeType::Note,
        ref_target: Some(project_path.to_string()),
        x: 0.0,
        y: 0.0,
        width: PROJECT_OVERVIEW_WIDTH,
        height: PROJECT_OVERVIEW_HEIGHT,
        title: None,
        text: None,
        completed: None,
        parent_id: None,
    }
}

fn ensure_project_overview_node(nodes: &mut Vec<ProjectCanvasNode>, project_path: &str) {
    if let Some(node) = nodes
        .iter_mut()
        .find(|node| node.id == PROJECT_OVERVIEW_NODE_ID)
    {
        node.node_type = ProjectCanvasNodeType::Note;
        node.ref_target = Some(project_path.to_string());
        node.text = None;
        node.completed = None;
        return;
    }
    nodes.push(project_overview_node(project_path));
}

pub fn project_canvas_paths(
    vault_path: &Path,
    project_path: &str,
) -> Result<ProjectCanvasPaths, String> {
    let project_note = resolve_project_note_path(vault_path, project_path)?;
    ensure_project_note(&project_note)?;
    let relative_project_path = relative_path_string(vault_path, &project_note)?;
    let canvas_path = canvas_path_for_project_note(&project_note)?;
    let relative_canvas_path = relative_path_string(vault_path, &canvas_path)?;

    Ok(ProjectCanvasPaths {
        project_path: relative_project_path,
        canvas_path: relative_canvas_path,
    })
}

pub fn read_project_canvas_file(
    vault_path: &Path,
    project_path: &str,
) -> Result<ProjectCanvasReadResult, String> {
    let paths = project_canvas_paths(vault_path, project_path)?;
    let canvas_path = vault_path.join(&paths.canvas_path);
    if !canvas_path.exists() {
        return Ok(ProjectCanvasReadResult {
            project_path: paths.project_path,
            canvas_path: paths.canvas_path,
            state: ProjectCanvasState::Missing,
            canvas: None,
        });
    }

    let content = fs::read_to_string(&canvas_path).map_err(|error| {
        format!(
            "Failed to read Project Canvas {}: {error}",
            canvas_path.display()
        )
    })?;
    let canvas = serde_json::from_str::<ProjectCanvas>(&content).map_err(|error| {
        format!(
            "Failed to parse Project Canvas {}: {error}",
            canvas_path.display()
        )
    })?;
    let canvas = normalize_project_canvas(canvas, &paths.project_path);

    Ok(ProjectCanvasReadResult {
        project_path: paths.project_path,
        canvas_path: paths.canvas_path,
        state: ProjectCanvasState::Ready,
        canvas: Some(canvas),
    })
}

pub fn create_project_canvas_file(
    vault_path: &Path,
    project_path: &str,
) -> Result<ProjectCanvasReadResult, String> {
    let paths = project_canvas_paths(vault_path, project_path)?;
    let canvas = default_project_canvas(&paths.project_path);
    save_project_canvas_at_paths(vault_path, &paths, canvas)
}

pub fn save_project_canvas_file(
    vault_path: &Path,
    project_path: &str,
    canvas: ProjectCanvas,
) -> Result<ProjectCanvasReadResult, String> {
    validate_project_canvas(&canvas)?;
    let paths = project_canvas_paths(vault_path, project_path)?;
    save_project_canvas_at_paths(vault_path, &paths, canvas)
}

pub fn resolve_project_canvas_refs_file(
    vault_path: &Path,
    project_path: &str,
    canvas: &ProjectCanvas,
) -> Result<ProjectCanvasResolveResult, String> {
    let paths = project_canvas_paths(vault_path, project_path)?;
    let normalized = normalize_project_canvas(canvas.clone(), &paths.project_path);
    let entries = scan_vault(vault_path, &HashMap::new())?;
    let entry_index = EntryIndex::new(vault_path, entries);
    let mut refs = Vec::new();
    let mut diagnostics = Vec::new();

    for node in &normalized.nodes {
        let resolved = resolve_node_ref(node, &entry_index);
        if let ProjectCanvasRefState::Stale = resolved.state {
            diagnostics.push(ProjectCanvasRefDiagnostic {
                node_id: node.id.clone(),
                kind: stale_kind_for_node(node),
                message: resolved
                    .message
                    .clone()
                    .unwrap_or_else(|| "Project Canvas reference is stale".to_string()),
                ref_target: node.ref_target.clone(),
            });
        }
        refs.push(resolved);
    }

    Ok(ProjectCanvasResolveResult {
        project_path: paths.project_path,
        canvas_path: paths.canvas_path,
        refs,
        diagnostics,
    })
}

fn save_project_canvas_at_paths(
    vault_path: &Path,
    paths: &ProjectCanvasPaths,
    canvas: ProjectCanvas,
) -> Result<ProjectCanvasReadResult, String> {
    let canvas_path = vault_path.join(&paths.canvas_path);
    if let Some(parent) = canvas_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create Project Canvas directory {}: {error}",
                parent.display()
            )
        })?;
    }

    let canvas = normalize_project_canvas(canvas, &paths.project_path);
    let content = format!(
        "{}\n",
        serde_json::to_string_pretty(&canvas)
            .map_err(|error| format!("Failed to serialize Project Canvas: {error}"))?
    );
    fs::write(&canvas_path, content).map_err(|error| {
        format!(
            "Failed to write Project Canvas {}: {error}",
            canvas_path.display()
        )
    })?;

    Ok(ProjectCanvasReadResult {
        project_path: paths.project_path.clone(),
        canvas_path: paths.canvas_path.clone(),
        state: ProjectCanvasState::Ready,
        canvas: Some(canvas),
    })
}

fn resolve_project_note_path(vault_path: &Path, project_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(project_path);
    let candidate = if path.is_absolute() {
        path
    } else {
        vault_path.join(path)
    };
    let canonical_vault = vault_path.canonicalize().map_err(|error| {
        format!(
            "Failed to resolve vault path {}: {error}",
            vault_path.display()
        )
    })?;
    let canonical_candidate = candidate.canonicalize().map_err(|error| {
        format!(
            "Project note does not exist: {} ({error})",
            candidate.display()
        )
    })?;
    canonical_candidate
        .strip_prefix(&canonical_vault)
        .map_err(|_| "Project note must be inside the active vault".to_string())?;
    Ok(candidate)
}

fn ensure_project_note(project_note: &Path) -> Result<(), String> {
    if project_note.extension().and_then(|value| value.to_str()) != Some("md") {
        return Err("Project Canvas requires a Markdown Project note".to_string());
    }
    let entry = crate::vault::parse_md_file(project_note, None)?;
    if entry.is_a.as_deref() != Some("Project") {
        return Err("Project Canvas can only be attached to type: Project notes".to_string());
    }
    Ok(())
}

fn canvas_path_for_project_note(project_note: &Path) -> Result<PathBuf, String> {
    if project_note.file_name().and_then(|value| value.to_str()) == Some("project.md") {
        return Ok(project_note.with_file_name(PROJECT_CANVAS_FILENAME));
    }

    let stem = project_note
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Project note must have a valid filename".to_string())?;
    Ok(project_note.with_file_name(format!("{stem}.{PROJECT_CANVAS_EXTENSION}")))
}

fn relative_path_string(vault_path: &Path, path: &Path) -> Result<String, String> {
    let absolute_path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        vault_path.join(path)
    };
    let relative = absolute_path
        .strip_prefix(vault_path)
        .map_err(|_| "Path must be inside the active vault".to_string())?;
    Ok(path_slash(relative))
}

fn path_slash(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn normalize_ref_path(value: &str) -> String {
    value.trim().trim_start_matches("./").replace('\\', "/")
}

struct EntryIndex {
    vault_path: PathBuf,
    entries_by_path: HashMap<String, VaultEntry>,
    paper_by_id: HashMap<String, VaultEntry>,
}

impl EntryIndex {
    fn new(vault_path: &Path, entries: Vec<VaultEntry>) -> Self {
        let mut entries_by_path = HashMap::new();
        let mut paper_by_id = HashMap::new();

        for entry in entries {
            let relative_path = Path::new(&entry.path)
                .strip_prefix(vault_path)
                .map(path_slash)
                .unwrap_or_else(|_| normalize_ref_path(&entry.path));
            entries_by_path.insert(normalize_ref_path(&relative_path), entry.clone());
            entries_by_path.insert(normalize_ref_path(&entry.path), entry.clone());

            if entry.is_a.as_deref() == Some("Paper") {
                let paper_id = property_string(&entry.properties, "paper_id")
                    .or_else(|| paper_id_from_path(&entry.path))
                    .unwrap_or_else(|| entry.title.clone());
                paper_by_id.insert(paper_id, entry);
            }
        }

        Self {
            vault_path: vault_path.to_path_buf(),
            entries_by_path,
            paper_by_id,
        }
    }

    fn entry_by_ref(&self, ref_target: &str) -> Option<&VaultEntry> {
        self.entries_by_path.get(&normalize_ref_path(ref_target))
    }

    fn paper_by_id(&self, paper_id: &str) -> Option<&VaultEntry> {
        self.paper_by_id.get(paper_id)
    }
}

fn property_string(properties: &HashMap<String, Value>, key: &str) -> Option<String> {
    match properties.get(key)? {
        Value::String(value) => Some(value.trim().to_string()).filter(|value| !value.is_empty()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn paper_id_from_path(path: &str) -> Option<String> {
    Path::new(path)
        .parent()?
        .file_name()?
        .to_str()
        .map(str::to_string)
}

fn resolve_node_ref(
    node: &ProjectCanvasNode,
    entry_index: &EntryIndex,
) -> ProjectCanvasResolvedRef {
    let Some(ref_target) = node
        .ref_target
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return ProjectCanvasResolvedRef {
            node_id: node.id.clone(),
            node_type: node.node_type.clone(),
            ref_target: node.ref_target.clone(),
            state: ProjectCanvasRefState::Embedded,
            target_path: None,
            target_title: None,
            message: None,
        };
    };

    match node.node_type {
        ProjectCanvasNodeType::Note => resolve_entry_node(node, ref_target, entry_index, None),
        ProjectCanvasNodeType::Paper => {
            resolve_entry_node(node, ref_target, entry_index, Some("Paper"))
        }
        ProjectCanvasNodeType::PaperBlock => {
            resolve_paper_block_node(node, ref_target, entry_index)
        }
        ProjectCanvasNodeType::Image => resolve_image_node(node, ref_target, entry_index),
        ProjectCanvasNodeType::Text
        | ProjectCanvasNodeType::Task
        | ProjectCanvasNodeType::Group => stale_ref(
            node,
            "Embedded Project Canvas nodes should not have external refs",
        ),
    }
}

fn resolve_image_node(
    node: &ProjectCanvasNode,
    ref_target: &str,
    entry_index: &EntryIndex,
) -> ProjectCanvasResolvedRef {
    let normalized = normalize_ref_path(ref_target);
    let image_path = entry_index.vault_path.join(&normalized);
    if image_path.exists() {
        ProjectCanvasResolvedRef {
            node_id: node.id.clone(),
            node_type: node.node_type.clone(),
            ref_target: node.ref_target.clone(),
            state: ProjectCanvasRefState::Resolved,
            target_path: Some(path_slash(Path::new(&normalized))),
            target_title: node.title.clone(),
            message: None,
        }
    } else {
        stale_ref(node, "Referenced image does not exist")
    }
}

fn resolve_entry_node(
    node: &ProjectCanvasNode,
    ref_target: &str,
    entry_index: &EntryIndex,
    required_type: Option<&str>,
) -> ProjectCanvasResolvedRef {
    let Some(entry) = entry_index.entry_by_ref(ref_target) else {
        return stale_ref(node, "Referenced note does not exist");
    };
    if let Some(required_type) = required_type {
        if entry.is_a.as_deref() != Some(required_type) {
            return stale_ref(node, "Referenced note is not the expected type");
        }
    }
    ProjectCanvasResolvedRef {
        node_id: node.id.clone(),
        node_type: node.node_type.clone(),
        ref_target: node.ref_target.clone(),
        state: ProjectCanvasRefState::Resolved,
        target_path: Some(entry.path.clone()),
        target_title: Some(entry.title.clone()),
        message: None,
    }
}

fn resolve_paper_block_node(
    node: &ProjectCanvasNode,
    ref_target: &str,
    entry_index: &EntryIndex,
) -> ProjectCanvasResolvedRef {
    let Some((paper_id, block_id)) = parse_block_ref(ref_target) else {
        return stale_ref(node, "Paper block ref must use @block[paper_id#block_id]");
    };
    let Some(paper) = entry_index.paper_by_id(&paper_id) else {
        return stale_ref(node, "Referenced Paper does not exist");
    };
    let Some(parent) = Path::new(&paper.path).parent() else {
        return stale_ref(node, "Referenced Paper path has no bundle directory");
    };
    let blocks_path = parent.join("blocks.jsonl");
    match read_paper_blocks_file(&paper_id, &blocks_path) {
        Ok(result) if result.state == PaperBlocksState::Ready => {
            if result.blocks.iter().any(|block| block.id == block_id) {
                ProjectCanvasResolvedRef {
                    node_id: node.id.clone(),
                    node_type: node.node_type.clone(),
                    ref_target: node.ref_target.clone(),
                    state: ProjectCanvasRefState::Resolved,
                    target_path: Some(paper.path.clone()),
                    target_title: Some(paper.title.clone()),
                    message: None,
                }
            } else {
                stale_ref(node, "Referenced Paper block does not exist")
            }
        }
        Ok(_) => stale_ref(node, "Referenced Paper block index is missing or empty"),
        Err(error) => stale_ref(
            node,
            &format!("Referenced Paper block index is invalid: {}", error.message),
        ),
    }
}

fn parse_block_ref(value: &str) -> Option<(String, String)> {
    let inner = value.strip_prefix("@block[")?.strip_suffix(']')?;
    let (paper_id, block_id) = inner.split_once('#')?;
    let paper_id = paper_id.trim();
    let block_id = block_id.trim();
    if paper_id.is_empty() || block_id.is_empty() {
        None
    } else {
        Some((paper_id.to_string(), block_id.to_string()))
    }
}

fn stale_ref(node: &ProjectCanvasNode, message: &str) -> ProjectCanvasResolvedRef {
    ProjectCanvasResolvedRef {
        node_id: node.id.clone(),
        node_type: node.node_type.clone(),
        ref_target: node.ref_target.clone(),
        state: ProjectCanvasRefState::Stale,
        target_path: None,
        target_title: None,
        message: Some(message.to_string()),
    }
}

fn stale_kind_for_node(node: &ProjectCanvasNode) -> String {
    match node.node_type {
        ProjectCanvasNodeType::Note => "missing_note",
        ProjectCanvasNodeType::Paper => "missing_paper",
        ProjectCanvasNodeType::PaperBlock => "missing_paper_block",
        ProjectCanvasNodeType::Image => "missing_image",
        ProjectCanvasNodeType::Text
        | ProjectCanvasNodeType::Task
        | ProjectCanvasNodeType::Group => "unexpected_ref",
    }
    .to_string()
}

pub fn validate_project_canvas(canvas: &ProjectCanvas) -> Result<(), String> {
    let mut node_ids = HashSet::new();
    for node in &canvas.nodes {
        if node.id.trim().is_empty() {
            return Err("Project Canvas node id cannot be empty".to_string());
        }
        if !node_ids.insert(node.id.as_str()) {
            return Err(format!("Project Canvas node id is duplicated: {}", node.id));
        }
    }

    let mut edge_ids = HashSet::new();
    for edge in &canvas.edges {
        if edge.id.trim().is_empty() {
            return Err("Project Canvas edge id cannot be empty".to_string());
        }
        if !edge_ids.insert(edge.id.as_str()) {
            return Err(format!("Project Canvas edge id is duplicated: {}", edge.id));
        }
        if !node_ids.contains(edge.from.as_str()) {
            return Err(format!(
                "Project Canvas edge {} references missing source node {}",
                edge.id, edge.from
            ));
        }
        if !node_ids.contains(edge.to.as_str()) {
            return Err(format!(
                "Project Canvas edge {} references missing target node {}",
                edge.id, edge.to
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
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

    fn sample_canvas(project_path: &str) -> ProjectCanvas {
        let canvas = ProjectCanvas {
            version: 99,
            project: "stale.md".to_string(),
            viewport: ProjectCanvasViewport {
                x: f64::NAN,
                y: 10.0,
                zoom: 0.0,
            },
            nodes: vec![
                ProjectCanvasNode {
                    id: "node_note".to_string(),
                    node_type: ProjectCanvasNodeType::Note,
                    ref_target: Some("notes/question.md".to_string()),
                    x: 10.0,
                    y: 20.0,
                    width: 300.0,
                    height: 160.0,
                    title: None,
                    text: None,
                    completed: None,
                    parent_id: None,
                },
                ProjectCanvasNode {
                    id: "node_text".to_string(),
                    node_type: ProjectCanvasNodeType::Text,
                    ref_target: None,
                    x: 0.0,
                    y: 0.0,
                    width: 200.0,
                    height: 120.0,
                    title: Some("Claim".to_string()),
                    text: Some("KANs need comparison".to_string()),
                    completed: None,
                    parent_id: None,
                },
            ],
            edges: vec![ProjectCanvasEdge {
                id: "edge_related".to_string(),
                from: "node_note".to_string(),
                to: "node_text".to_string(),
                kind: ProjectCanvasEdgeKind::Related,
                note: None,
                routing: Some(ProjectCanvasEdgeRouting::Curved),
            }],
            sapientia: ProjectCanvasSapientiaMetadata {
                schema: "old".to_string(),
            },
        };
        normalize_project_canvas(canvas, project_path)
    }

    #[test]
    fn discovers_canonical_and_adjacent_canvas_paths() {
        let dir = TempDir::new().unwrap();
        write_project(&dir, "projects/alpha/project.md");
        write_project(&dir, "projects/beta.md");

        let canonical = project_canvas_paths(dir.path(), "projects/alpha/project.md").unwrap();
        assert_eq!(canonical.canvas_path, "projects/alpha/project.canvas.json");

        let adjacent = project_canvas_paths(dir.path(), "projects/beta.md").unwrap();
        assert_eq!(adjacent.canvas_path, "projects/beta.canvas.json");
    }

    #[test]
    fn creates_and_migrates_the_required_project_overview_node() {
        let project_path = "projects/alpha/project.md";
        let canvas = default_project_canvas(project_path);
        assert_eq!(canvas.nodes.len(), 1);
        assert_eq!(canvas.nodes[0].id, PROJECT_OVERVIEW_NODE_ID);
        assert_eq!(canvas.nodes[0].node_type, ProjectCanvasNodeType::Note);
        assert_eq!(canvas.nodes[0].ref_target.as_deref(), Some(project_path));

        let legacy = ProjectCanvas {
            nodes: vec![],
            ..default_project_canvas(project_path)
        };
        let migrated = normalize_project_canvas(legacy, project_path);
        assert_eq!(migrated.nodes.len(), 1);
        assert_eq!(migrated.nodes[0].id, PROJECT_OVERVIEW_NODE_ID);
    }

    #[test]
    fn creates_reads_and_stably_writes_canvas() {
        let dir = TempDir::new().unwrap();
        write_project(&dir, "projects/alpha/project.md");
        let project_path = "projects/alpha/project.md";
        let canvas = sample_canvas(project_path);

        let saved = save_project_canvas_file(dir.path(), project_path, canvas).unwrap();
        assert_eq!(saved.state, ProjectCanvasState::Ready);
        let first = fs::read_to_string(dir.path().join(&saved.canvas_path)).unwrap();
        assert!(first.ends_with('\n'));
        assert!(first.contains("\"schema\": \"project-canvas/v1\""));
        assert!(first.contains("\"project\": \"projects/alpha/project.md\""));

        let read = read_project_canvas_file(dir.path(), project_path).unwrap();
        assert_eq!(read.canvas.unwrap().nodes.len(), 3);

        let second = fs::read_to_string(dir.path().join(&saved.canvas_path)).unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn round_trips_all_node_and_edge_kinds() {
        let dir = TempDir::new().unwrap();
        write_project(&dir, "projects/alpha/project.md");
        let project_path = "projects/alpha/project.md";
        let nodes = [
            ProjectCanvasNodeType::Note,
            ProjectCanvasNodeType::Paper,
            ProjectCanvasNodeType::PaperBlock,
            ProjectCanvasNodeType::Image,
            ProjectCanvasNodeType::Text,
            ProjectCanvasNodeType::Task,
            ProjectCanvasNodeType::Group,
        ]
        .into_iter()
        .enumerate()
        .map(|(index, node_type)| ProjectCanvasNode {
            id: format!("node_{index}"),
            node_type,
            ref_target: None,
            x: index as f64,
            y: index as f64,
            width: 100.0,
            height: 80.0,
            title: None,
            text: None,
            completed: None,
            parent_id: None,
        })
        .collect::<Vec<_>>();
        let canvas = ProjectCanvas {
            nodes,
            edges: vec![
                ProjectCanvasEdge {
                    id: "edge_contradicts".to_string(),
                    from: "node_0".to_string(),
                    to: "node_1".to_string(),
                    kind: ProjectCanvasEdgeKind::Contradicts,
                    note: None,
                    routing: Some(ProjectCanvasEdgeRouting::Straight),
                },
                ProjectCanvasEdge {
                    id: "edge_supports".to_string(),
                    from: "node_1".to_string(),
                    to: "node_2".to_string(),
                    kind: ProjectCanvasEdgeKind::Supports,
                    note: None,
                    routing: Some(ProjectCanvasEdgeRouting::Orthogonal),
                },
                ProjectCanvasEdge {
                    id: "edge_depends".to_string(),
                    from: "node_2".to_string(),
                    to: "node_3".to_string(),
                    kind: ProjectCanvasEdgeKind::DependsOn,
                    note: None,
                    routing: Some(ProjectCanvasEdgeRouting::Curved),
                },
                ProjectCanvasEdge {
                    id: "edge_needs".to_string(),
                    from: "node_3".to_string(),
                    to: "node_4".to_string(),
                    kind: ProjectCanvasEdgeKind::NeedsReading,
                    note: None,
                    routing: None,
                },
            ],
            ..default_project_canvas(project_path)
        };

        save_project_canvas_file(dir.path(), project_path, canvas).unwrap();
        let read = read_project_canvas_file(dir.path(), project_path)
            .unwrap()
            .canvas
            .unwrap();
        assert_eq!(read.nodes.len(), 8);
        assert_eq!(read.edges.len(), 4);
        assert!(read
            .nodes
            .iter()
            .any(|node| node.node_type == ProjectCanvasNodeType::PaperBlock));
        assert!(read
            .edges
            .iter()
            .any(|edge| edge.kind == ProjectCanvasEdgeKind::NeedsReading));
        assert!(read
            .edges
            .iter()
            .any(|edge| edge.routing == Some(ProjectCanvasEdgeRouting::Curved)));
    }

    #[test]
    fn resolves_existing_refs_and_reports_missing_refs() {
        let dir = TempDir::new().unwrap();
        write_project(&dir, "projects/alpha/project.md");
        write_note(&dir, "notes/question.md", "Note", "Question");
        write_note(&dir, "papers/kan/paper.md", "Paper", "KAN Paper");
        fs::write(
            dir.path().join("papers/kan/paper.md"),
            "---\ntype: Paper\npaper_id: kan\ntitle: KAN Paper\n---\n# KAN Paper\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("papers/kan/blocks.jsonl"),
            "{\"id\":\"b1\",\"paper_id\":\"kan\",\"kind\":\"paragraph\",\"page\":1,\"hash\":\"sha256:1\",\"text\":\"Evidence\"}\n",
        )
        .unwrap();

        let mut canvas = default_project_canvas("projects/alpha/project.md");
        canvas.nodes = vec![
            ProjectCanvasNode {
                id: "existing_note".to_string(),
                node_type: ProjectCanvasNodeType::Note,
                ref_target: Some("notes/question.md".to_string()),
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 80.0,
                title: None,
                text: None,
                completed: None,
                parent_id: None,
            },
            ProjectCanvasNode {
                id: "existing_block".to_string(),
                node_type: ProjectCanvasNodeType::PaperBlock,
                ref_target: Some("@block[kan#b1]".to_string()),
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 80.0,
                title: None,
                text: None,
                completed: None,
                parent_id: None,
            },
            ProjectCanvasNode {
                id: "missing".to_string(),
                node_type: ProjectCanvasNodeType::Note,
                ref_target: Some("notes/missing.md".to_string()),
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 80.0,
                title: None,
                text: None,
                completed: None,
                parent_id: None,
            },
        ];

        let resolved =
            resolve_project_canvas_refs_file(dir.path(), "projects/alpha/project.md", &canvas)
                .unwrap();
        assert_eq!(resolved.refs.len(), 4);
        assert_eq!(resolved.diagnostics.len(), 1);
        assert!(resolved
            .refs
            .iter()
            .any(|item| item.node_id == "existing_note"
                && item.state == ProjectCanvasRefState::Resolved));
        assert!(resolved
            .refs
            .iter()
            .any(|item| item.node_id == "existing_block"
                && item.state == ProjectCanvasRefState::Resolved));
        assert_eq!(resolved.diagnostics[0].node_id, "missing");
    }
}
