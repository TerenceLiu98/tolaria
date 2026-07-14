use std::fs;
use std::path::Path;

use tempfile::TempDir;
use tolaria_lib::project_canvas::{
    default_project_canvas, normalize_project_canvas, project_canvas_paths,
    read_project_canvas_file, resolve_project_canvas_refs_file, save_project_canvas_file,
    validate_project_canvas, ProjectCanvas, ProjectCanvasEdge, ProjectCanvasEdgeKind,
    ProjectCanvasNode, ProjectCanvasNodeType, ProjectCanvasRefState, ProjectCanvasState,
    PROJECT_OVERVIEW_NODE_ID,
};

fn write_note(root: &Path, relative_path: &str, note_type: &str, title: &str, extra: &str) {
    let path = root.join(relative_path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(
        path,
        format!("---\ntype: {note_type}\ntitle: {title}\n{extra}---\n# {title}\n"),
    )
    .unwrap();
}

fn node(id: &str, node_type: ProjectCanvasNodeType, ref_target: Option<&str>) -> ProjectCanvasNode {
    ProjectCanvasNode {
        id: id.to_string(),
        node_type,
        ref_target: ref_target.map(str::to_string),
        x: 0.0,
        y: 0.0,
        width: 240.0,
        height: 160.0,
        title: Some(id.to_string()),
        text: None,
        completed: None,
        parent_id: None,
    }
}

fn diagnostic<'a>(
    result: &'a tolaria_lib::project_canvas::ProjectCanvasResolveResult,
    node_id: &str,
) -> &'a tolaria_lib::project_canvas::ProjectCanvasRefDiagnostic {
    result
        .diagnostics
        .iter()
        .find(|item| item.node_id == node_id)
        .unwrap()
}

#[test]
fn normalizes_non_finite_viewport_and_repairs_existing_overview() {
    let project_path = "projects/alpha/project.md";
    let mut canvas = default_project_canvas(project_path);
    canvas.viewport.x = f64::INFINITY;
    canvas.viewport.y = f64::NAN;
    canvas.viewport.zoom = f64::NEG_INFINITY;
    canvas.nodes[0].node_type = ProjectCanvasNodeType::Task;
    canvas.nodes[0].ref_target = Some("wrong.md".to_string());
    canvas.nodes[0].text = Some("not allowed".to_string());
    canvas.nodes[0].completed = Some(true);

    let normalized = normalize_project_canvas(canvas, project_path);

    assert_eq!(normalized.viewport.x, 0.0);
    assert_eq!(normalized.viewport.y, 0.0);
    assert_eq!(normalized.viewport.zoom, 1.0);
    assert_eq!(normalized.nodes.len(), 1);
    assert_eq!(normalized.nodes[0].id, PROJECT_OVERVIEW_NODE_ID);
    assert_eq!(normalized.nodes[0].node_type, ProjectCanvasNodeType::Note);
    assert_eq!(
        normalized.nodes[0].ref_target.as_deref(),
        Some(project_path)
    );
    assert_eq!(normalized.nodes[0].text, None);
    assert_eq!(normalized.nodes[0].completed, None);
}

#[test]
fn reports_missing_and_malformed_canvas_files() {
    let vault = TempDir::new().unwrap();
    write_note(
        vault.path(),
        "projects/alpha/project.md",
        "Project",
        "Alpha",
        "",
    );

    let missing = read_project_canvas_file(vault.path(), "projects/alpha/project.md").unwrap();
    assert_eq!(missing.state, ProjectCanvasState::Missing);
    assert_eq!(missing.canvas, None);

    fs::write(
        vault.path().join("projects/alpha/project.canvas.json"),
        "{not-json}",
    )
    .unwrap();
    let error = read_project_canvas_file(vault.path(), "projects/alpha/project.md").unwrap_err();
    assert!(error.contains("Failed to parse Project Canvas"));

    write_note(
        vault.path(),
        "projects/beta/project.md",
        "Project",
        "Beta",
        "",
    );
    let directory_canvas = vault.path().join("projects/beta/project.canvas.json");
    fs::create_dir(&directory_canvas).unwrap();
    let read_error =
        read_project_canvas_file(vault.path(), "projects/beta/project.md").unwrap_err();
    assert!(read_error.contains("Failed to read Project Canvas"));

    let write_error = save_project_canvas_file(
        vault.path(),
        "projects/beta/project.md",
        default_project_canvas("projects/beta/project.md"),
    )
    .unwrap_err();
    assert!(write_error.contains("Failed to write Project Canvas"));
}

#[test]
fn rejects_invalid_project_note_boundaries() {
    let vault = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    write_note(vault.path(), "notes/plain.md", "Note", "Plain", "");
    fs::write(vault.path().join("project.txt"), "not markdown").unwrap();
    write_note(outside.path(), "project.md", "Project", "Outside", "");

    let missing = project_canvas_paths(vault.path(), "missing.md").unwrap_err();
    assert!(missing.contains("Project note does not exist"));

    let non_markdown = project_canvas_paths(vault.path(), "project.txt").unwrap_err();
    assert!(non_markdown.contains("requires a Markdown Project note"));

    let wrong_type = project_canvas_paths(vault.path(), "notes/plain.md").unwrap_err();
    assert!(wrong_type.contains("type: Project"));

    let outside_error = project_canvas_paths(
        vault.path(),
        outside.path().join("project.md").to_str().unwrap(),
    )
    .unwrap_err();
    assert!(outside_error.contains("inside the active vault"));

    let missing_vault = vault.path().join("gone");
    let vault_error = project_canvas_paths(&missing_vault, "project.md").unwrap_err();
    assert!(vault_error.contains("Failed to resolve vault path"));
}

#[test]
fn resolves_project_membership_and_degrades_each_stale_reference_kind() {
    let vault = TempDir::new().unwrap();
    write_note(
        vault.path(),
        "projects/alpha/project.md",
        "Project",
        "Alpha",
        "",
    );
    write_note(vault.path(), "notes/question.md", "Note", "Question", "");
    write_note(
        vault.path(),
        "papers/ready/paper.md",
        "Paper",
        "Ready Paper",
        "paper_id: ready\n",
    );
    write_note(
        vault.path(),
        "papers/empty/paper.md",
        "Paper",
        "Empty Paper",
        "paper_id: empty\n",
    );
    write_note(
        vault.path(),
        "papers/invalid/paper.md",
        "Paper",
        "Invalid Paper",
        "paper_id: invalid\n",
    );
    write_note(
        vault.path(),
        "papers/fallback/paper.md",
        "Paper",
        "Fallback Paper",
        "",
    );
    write_note(
        vault.path(),
        "papers/numeric/paper.md",
        "Paper",
        "Numeric Paper",
        "paper_id: 42\n",
    );
    fs::write(
        vault.path().join("papers/ready/blocks.jsonl"),
        "{\"id\":\"b1\",\"paper_id\":\"ready\",\"kind\":\"paragraph\",\"page\":1,\"hash\":\"sha256:1\",\"text\":\"Evidence\"}\n",
    )
    .unwrap();
    fs::write(
        vault.path().join("papers/fallback/blocks.jsonl"),
        "{\"id\":\"b1\",\"paper_id\":\"fallback\",\"kind\":\"paragraph\",\"page\":1,\"hash\":\"sha256:1\",\"text\":\"Fallback\"}\n",
    )
    .unwrap();
    fs::write(
        vault.path().join("papers/numeric/blocks.jsonl"),
        "{\"id\":\"b1\",\"paper_id\":\"42\",\"kind\":\"paragraph\",\"page\":1,\"hash\":\"sha256:1\",\"text\":\"Numeric\"}\n",
    )
    .unwrap();
    fs::write(
        vault.path().join("papers/invalid/blocks.jsonl"),
        "not-json\n",
    )
    .unwrap();
    fs::create_dir_all(vault.path().join("assets")).unwrap();
    fs::write(vault.path().join("assets/figure.png"), b"image").unwrap();

    let project_path = "projects/alpha/project.md";
    let mut canvas = default_project_canvas(project_path);
    canvas.nodes.extend([
        node("embedded", ProjectCanvasNodeType::Text, None),
        node(
            "note",
            ProjectCanvasNodeType::Note,
            Some("./notes\\question.md"),
        ),
        node(
            "paper",
            ProjectCanvasNodeType::Paper,
            Some("papers/ready/paper.md"),
        ),
        node(
            "paper_wrong_type",
            ProjectCanvasNodeType::Paper,
            Some("notes/question.md"),
        ),
        node(
            "image",
            ProjectCanvasNodeType::Image,
            Some("assets/figure.png"),
        ),
        node(
            "missing_image",
            ProjectCanvasNodeType::Image,
            Some("assets/missing.png"),
        ),
        node(
            "unexpected_text_ref",
            ProjectCanvasNodeType::Text,
            Some("notes/question.md"),
        ),
        node(
            "unexpected_task_ref",
            ProjectCanvasNodeType::Task,
            Some("notes/question.md"),
        ),
        node(
            "unexpected_group_ref",
            ProjectCanvasNodeType::Group,
            Some("notes/question.md"),
        ),
        node(
            "block",
            ProjectCanvasNodeType::PaperBlock,
            Some("@block[ready#b1]"),
        ),
        node(
            "malformed_block",
            ProjectCanvasNodeType::PaperBlock,
            Some("@block[ready#]"),
        ),
        node(
            "missing_paper",
            ProjectCanvasNodeType::PaperBlock,
            Some("@block[missing#b1]"),
        ),
        node(
            "missing_block",
            ProjectCanvasNodeType::PaperBlock,
            Some("@block[ready#b2]"),
        ),
        node(
            "missing_index",
            ProjectCanvasNodeType::PaperBlock,
            Some("@block[empty#b1]"),
        ),
        node(
            "invalid_index",
            ProjectCanvasNodeType::PaperBlock,
            Some("@block[invalid#b1]"),
        ),
        node(
            "fallback_id",
            ProjectCanvasNodeType::PaperBlock,
            Some("@block[fallback#b1]"),
        ),
        node(
            "numeric_id",
            ProjectCanvasNodeType::PaperBlock,
            Some("@block[42#b1]"),
        ),
    ]);

    let result = resolve_project_canvas_refs_file(vault.path(), project_path, &canvas).unwrap();

    for id in [
        "note",
        "paper",
        "image",
        "block",
        "fallback_id",
        "numeric_id",
    ] {
        assert_eq!(
            result
                .refs
                .iter()
                .find(|item| item.node_id == id)
                .unwrap()
                .state,
            ProjectCanvasRefState::Resolved,
        );
    }
    assert_eq!(
        result
            .refs
            .iter()
            .find(|item| item.node_id == "embedded")
            .unwrap()
            .state,
        ProjectCanvasRefState::Embedded,
    );
    assert_eq!(
        diagnostic(&result, "paper_wrong_type").kind,
        "missing_paper"
    );
    assert_eq!(diagnostic(&result, "missing_image").kind, "missing_image");
    assert_eq!(
        diagnostic(&result, "unexpected_text_ref").kind,
        "unexpected_ref"
    );
    assert_eq!(
        diagnostic(&result, "unexpected_task_ref").kind,
        "unexpected_ref"
    );
    assert_eq!(
        diagnostic(&result, "unexpected_group_ref").kind,
        "unexpected_ref"
    );
    assert!(diagnostic(&result, "malformed_block")
        .message
        .contains("must use @block"));
    assert!(diagnostic(&result, "missing_paper")
        .message
        .contains("Paper does not exist"));
    assert!(diagnostic(&result, "missing_block")
        .message
        .contains("block does not exist"));
    assert!(diagnostic(&result, "missing_index")
        .message
        .contains("index is missing or empty"));
    assert!(diagnostic(&result, "invalid_index")
        .message
        .contains("index is invalid"));
}

#[test]
fn validates_every_node_and_edge_identity_constraint() {
    let project_path = "projects/alpha/project.md";

    let mut empty_node = default_project_canvas(project_path);
    empty_node.nodes[0].id = " ".to_string();
    assert!(validate_project_canvas(&empty_node)
        .unwrap_err()
        .contains("node id cannot be empty"));

    let mut duplicate_node = default_project_canvas(project_path);
    duplicate_node.nodes.push(duplicate_node.nodes[0].clone());
    assert!(validate_project_canvas(&duplicate_node)
        .unwrap_err()
        .contains("node id is duplicated"));

    let base_nodes = vec![
        node("from", ProjectCanvasNodeType::Text, None),
        node("to", ProjectCanvasNodeType::Text, None),
    ];
    let edge = |id: &str, from: &str, to: &str| ProjectCanvasEdge {
        id: id.to_string(),
        from: from.to_string(),
        to: to.to_string(),
        kind: ProjectCanvasEdgeKind::Related,
        note: None,
        routing: None,
    };
    let with_edges = |edges| ProjectCanvas {
        nodes: base_nodes.clone(),
        edges,
        ..default_project_canvas(project_path)
    };

    assert!(
        validate_project_canvas(&with_edges(vec![edge(" ", "from", "to")]))
            .unwrap_err()
            .contains("edge id cannot be empty")
    );
    assert!(validate_project_canvas(&with_edges(vec![
        edge("same", "from", "to"),
        edge("same", "to", "from"),
    ]))
    .unwrap_err()
    .contains("edge id is duplicated"));
    assert!(
        validate_project_canvas(&with_edges(vec![edge("source", "missing", "to")]))
            .unwrap_err()
            .contains("missing source node")
    );
    assert!(
        validate_project_canvas(&with_edges(vec![edge("target", "from", "missing")]))
            .unwrap_err()
            .contains("missing target node")
    );
    assert!(validate_project_canvas(&with_edges(vec![edge("valid", "from", "to")])).is_ok());
}
