use std::collections::BTreeMap;
use std::fs;

use serde_json::json;
use tempfile::TempDir;
use tolaria_lib::paper::{
    delete_paper_comment_file, find_paper_block, parse_comments_jsonl, read_paper_blocks_file,
    read_paper_comments_file, reset_paper_comments_file, save_paper_comment_file,
    search_paper_blocks_file, PaperBlocksError, PaperBlocksState, PaperComment, PaperCommentKind,
    PaperCommentsError, PaperCommentsState,
};

fn comment(id: &str, paper_id: &str, block_id: Option<&str>) -> PaperComment {
    PaperComment {
        id: id.to_string(),
        paper_id: paper_id.to_string(),
        block_id: block_id.map(str::to_string),
        kind: PaperCommentKind::Comment,
        text: Some("Evidence note".to_string()),
        created_at: "2026-07-10T12:00:00Z".to_string(),
        note: None,
        page: None,
        bbox: None,
        updated_at: None,
        deleted_at: None,
        extra: BTreeMap::new(),
    }
}

#[test]
fn block_sidecar_reports_boundary_read_and_shape_failures() {
    let boundary = PaperBlocksError::boundary("paper-1", "outside vault".to_string());
    assert_eq!(boundary.kind, "active_vault_boundary");
    assert_eq!(boundary.paper_id, "paper-1");

    let dir = TempDir::new().unwrap();
    let directory_path = dir.path().join("blocks.jsonl");
    fs::create_dir(&directory_path).unwrap();
    let read_error = read_paper_blocks_file("paper-1", &directory_path).unwrap_err();
    assert_eq!(read_error.kind, "read_failed");

    let cases = [
        ("[]\n", "invalid_shape"),
        (
            "{\"id\":\"\",\"paper_id\":\"paper-1\",\"kind\":\"paragraph\",\"page\":1,\"hash\":\"x\"}\n",
            "missing_required_field",
        ),
        (
            "{\"id\":\"b1\",\"paper_id\":\"paper-1\",\"kind\":\"paragraph\",\"page\":0,\"hash\":\"x\"}\n",
            "missing_required_field",
        ),
        (
            "{\"id\":\"b1\",\"paper_id\":\"paper-1\",\"kind\":\"paragraph\",\"hash\":\"x\"}\n",
            "missing_required_field",
        ),
        (
            "{\"id\":\"b1\",\"paper_id\":\"paper-1\",\"kind\":\"paragraph\",\"page\":1,\"hash\":\"x\",\"bbox\":\"invalid\"}\n",
            "invalid_field",
        ),
    ];
    for (index, (content, expected_kind)) in cases.into_iter().enumerate() {
        let path = dir.path().join(format!("invalid-{index}.jsonl"));
        fs::write(&path, content).unwrap();
        let error = read_paper_blocks_file("paper-1", &path).unwrap_err();
        assert!(error
            .line_errors
            .iter()
            .any(|line_error| line_error.kind == expected_kind));
    }
}

#[test]
fn block_lookup_and_search_preserve_empty_and_ready_states() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("blocks.jsonl");
    fs::write(
        &path,
        "\n{\"id\":\"b1\",\"paper_id\":\"paper-1\",\"kind\":\"figure\",\"page\":2,\"hash\":\"sha256:1\",\"caption\":\"Architecture Diagram\",\"section\":\"Method\"}\n",
    )
    .unwrap();

    let found = find_paper_block("paper-1", &path, "b1").unwrap();
    assert_eq!(found.block.unwrap().page, 2);
    assert!(find_paper_block("paper-1", &path, "missing")
        .unwrap()
        .block
        .is_none());
    assert_eq!(
        search_paper_blocks_file("paper-1", &path, "architecture")
            .unwrap()
            .blocks
            .len(),
        1,
    );
    assert!(search_paper_blocks_file("paper-1", &path, "   ")
        .unwrap()
        .blocks
        .is_empty());

    fs::write(&path, "\n").unwrap();
    assert_eq!(
        read_paper_blocks_file("paper-1", &path).unwrap().state,
        PaperBlocksState::Empty,
    );
}

#[test]
fn comment_sidecar_reports_boundary_read_and_parse_failures() {
    let boundary = PaperCommentsError::boundary("paper-1", "outside vault".to_string());
    assert_eq!(boundary.kind, "active_vault_boundary");
    assert_eq!(boundary.paper_id, "paper-1");

    let dir = TempDir::new().unwrap();
    let directory_path = dir.path().join("comments.jsonl");
    fs::create_dir(&directory_path).unwrap();
    let read_error = read_paper_comments_file("paper-1", &directory_path).unwrap_err();
    assert_eq!(read_error.kind, "read_failed");

    let cases = [
        ("[]\n", "invalid_shape"),
        (
            "{\"id\":\"\",\"paper_id\":\"paper-1\",\"block_id\":\"b1\",\"kind\":\"comment\",\"created_at\":\"now\"}\n",
            "missing_required_field",
        ),
        (
            "{\"id\":\"c1\",\"paper_id\":\"other\",\"block_id\":\"b1\",\"kind\":\"comment\",\"created_at\":\"now\"}\n",
            "paper_id_mismatch",
        ),
        (
            "{\"id\":\"c1\",\"paper_id\":\"paper-1\",\"block_id\":\"b1\",\"kind\":\"question\",\"created_at\":\"now\"}\n",
            "invalid_kind",
        ),
        (
            "{\"id\":\"c1\",\"paper_id\":\"paper-1\",\"block_id\":\"b1\",\"kind\":\"comment\",\"created_at\":\"now\",\"color\":\"yellow\"}\n",
            "deprecated_field",
        ),
        (
            "{\"id\":\"c1\",\"paper_id\":\"paper-1\",\"kind\":\"comment\",\"created_at\":\"now\",\"page\":1,\"bbox\":[1,2,3]}\n",
            "missing_comment_target",
        ),
        (
            "{\"id\":\"c1\",\"paper_id\":\"paper-1\",\"block_id\":\"b1\",\"kind\":\"comment\",\"created_at\":\"now\",\"page\":\"invalid\"}\n",
            "invalid_field",
        ),
    ];
    for (content, expected_kind) in cases {
        let error = parse_comments_jsonl("paper-1", "comments.jsonl", content).unwrap_err();
        assert!(error
            .line_errors
            .iter()
            .any(|line_error| line_error.kind == expected_kind));
    }
}

#[test]
fn comments_accept_pdf_targets_and_reject_invalid_writes() {
    let pdf_target = json!({
        "id": "c1",
        "paper_id": "paper-1",
        "kind": "comment",
        "created_at": "now",
        "page": 2,
        "bbox": [1, 2, 3, 4]
    });
    let parsed =
        parse_comments_jsonl("paper-1", "comments.jsonl", &format!("{pdf_target}\n")).unwrap();
    assert_eq!(parsed.state, PaperCommentsState::Ready);
    assert_eq!(parsed.comments[0].page, Some(2));

    let dir = TempDir::new().unwrap();
    let path = dir.path().join("comments.jsonl");
    let mismatch =
        save_paper_comment_file("paper-1", &path, comment("c2", "other-paper", Some("b1")))
            .unwrap_err();
    assert_eq!(mismatch.kind, "invalid_comment");
    assert!(mismatch
        .line_errors
        .iter()
        .any(|error| error.kind == "paper_id_mismatch"));

    let missing_target =
        save_paper_comment_file("paper-1", &path, comment("c3", "paper-1", None)).unwrap_err();
    assert!(missing_target
        .line_errors
        .iter()
        .any(|error| error.kind == "missing_comment_target"));
}

#[test]
fn comments_surface_directory_creation_and_file_write_failures() {
    let dir = TempDir::new().unwrap();
    let parent_file = dir.path().join("occupied");
    fs::write(&parent_file, "file").unwrap();
    let create_error = save_paper_comment_file(
        "paper-1",
        &parent_file.join("comments.jsonl"),
        comment("c1", "paper-1", Some("b1")),
    )
    .unwrap_err();
    assert_eq!(create_error.kind, "write_failed");
    assert!(create_error
        .message
        .contains("create comments sidecar directory"));

    let directory_path = dir.path().join("directory-comments.jsonl");
    fs::create_dir(&directory_path).unwrap();
    let write_error = reset_paper_comments_file("paper-1", &directory_path).unwrap_err();
    assert_eq!(write_error.kind, "write_failed");
    assert!(write_error.message.contains("write comments sidecar"));
}

#[test]
fn comments_round_trip_update_delete_and_reset() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("nested/comments.jsonl");
    let created =
        save_paper_comment_file("paper-1", &path, comment("c1", "paper-1", Some("b1"))).unwrap();
    assert_eq!(created.comments.len(), 1);

    let mut updated = created.comments[0].clone();
    updated.text = Some("Updated".to_string());
    let saved = save_paper_comment_file("paper-1", &path, updated).unwrap();
    assert_eq!(saved.comments.len(), 1);
    assert_eq!(saved.comments[0].text.as_deref(), Some("Updated"));

    let unchanged = delete_paper_comment_file("paper-1", &path, "missing").unwrap();
    assert_eq!(unchanged.comments.len(), 1);
    let deleted = delete_paper_comment_file("paper-1", &path, "c1").unwrap();
    assert_eq!(deleted.state, PaperCommentsState::Empty);
    assert!(deleted.comments.is_empty());

    let reset = reset_paper_comments_file("paper-1", &path).unwrap();
    assert_eq!(reset.state, PaperCommentsState::Empty);
}
