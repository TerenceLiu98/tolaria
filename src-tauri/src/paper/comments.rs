use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaperCommentKind {
    Comment,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PaperComment {
    pub id: String,
    pub paper_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub block_id: Option<String>,
    pub kind: PaperCommentKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bbox: Option<Vec<f64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaperCommentsState {
    Missing,
    Empty,
    Ready,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperCommentsLineError {
    pub line: usize,
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperCommentsReadResult {
    pub paper_id: String,
    pub path: String,
    pub state: PaperCommentsState,
    pub comments: Vec<PaperComment>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperCommentsError {
    pub kind: String,
    pub message: String,
    pub paper_id: String,
    pub path: String,
    pub line_errors: Vec<PaperCommentsLineError>,
}

impl PaperCommentsError {
    pub fn boundary(paper_id: &str, message: String) -> Self {
        Self {
            kind: "active_vault_boundary".to_string(),
            message,
            paper_id: paper_id.to_string(),
            path: String::new(),
            line_errors: vec![],
        }
    }

    fn write_failed(paper_id: &str, path: &str, message: String) -> Self {
        Self {
            kind: "write_failed".to_string(),
            message,
            paper_id: paper_id.to_string(),
            path: path.to_string(),
            line_errors: vec![],
        }
    }
}

pub fn read_paper_comments_file(
    paper_id: &str,
    comments_path: &Path,
) -> Result<PaperCommentsReadResult, PaperCommentsError> {
    let path = comments_path.to_string_lossy().into_owned();
    if !comments_path.exists() {
        return Ok(PaperCommentsReadResult {
            paper_id: paper_id.to_string(),
            path,
            state: PaperCommentsState::Missing,
            comments: vec![],
        });
    }

    let content = fs::read_to_string(comments_path).map_err(|error| PaperCommentsError {
        kind: "read_failed".to_string(),
        message: format!("Failed to read comments sidecar: {error}"),
        paper_id: paper_id.to_string(),
        path: path.clone(),
        line_errors: vec![],
    })?;

    parse_comments_jsonl(paper_id, &path, &content)
}

pub fn parse_comments_jsonl(
    paper_id: &str,
    path: &str,
    content: &str,
) -> Result<PaperCommentsReadResult, PaperCommentsError> {
    let mut comments = Vec::new();
    let mut errors = Vec::new();

    for (index, line) in content.lines().enumerate() {
        let line_number = index + 1;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        match parse_comment_line(paper_id, line_number, trimmed) {
            Ok(comment) => comments.push(comment),
            Err(line_errors) => errors.extend(line_errors),
        }
    }

    if !errors.is_empty() {
        return Err(PaperCommentsError {
            kind: "invalid_jsonl".to_string(),
            message: "comments.jsonl contains malformed PaperComment lines".to_string(),
            paper_id: paper_id.to_string(),
            path: path.to_string(),
            line_errors: errors,
        });
    }

    Ok(PaperCommentsReadResult {
        paper_id: paper_id.to_string(),
        path: path.to_string(),
        state: if comments.is_empty() {
            PaperCommentsState::Empty
        } else {
            PaperCommentsState::Ready
        },
        comments,
    })
}

pub fn save_paper_comment_file(
    paper_id: &str,
    comments_path: &Path,
    comment: PaperComment,
) -> Result<PaperCommentsReadResult, PaperCommentsError> {
    let path = comments_path.to_string_lossy().into_owned();
    validate_comment_for_write(paper_id, &comment)?;

    let mut comments = read_paper_comments_file(paper_id, comments_path)?.comments;
    match comments
        .iter()
        .position(|existing| existing.id == comment.id)
    {
        Some(index) => comments[index] = comment,
        None => comments.push(comment),
    }

    write_comments_jsonl(paper_id, comments_path, &path, &comments)?;
    read_paper_comments_file(paper_id, comments_path)
}

pub fn delete_paper_comment_file(
    paper_id: &str,
    comments_path: &Path,
    comment_id: &str,
) -> Result<PaperCommentsReadResult, PaperCommentsError> {
    let path = comments_path.to_string_lossy().into_owned();
    let mut comments = read_paper_comments_file(paper_id, comments_path)?.comments;
    comments.retain(|comment| comment.id != comment_id);

    write_comments_jsonl(paper_id, comments_path, &path, &comments)?;
    read_paper_comments_file(paper_id, comments_path)
}

pub fn reset_paper_comments_file(
    paper_id: &str,
    comments_path: &Path,
) -> Result<PaperCommentsReadResult, PaperCommentsError> {
    let path = comments_path.to_string_lossy().into_owned();
    write_comments_jsonl(paper_id, comments_path, &path, &[])?;
    read_paper_comments_file(paper_id, comments_path)
}

pub fn comments_by_block(comments: &[PaperComment], block_id: &str) -> Vec<PaperComment> {
    comments
        .iter()
        .filter(|comment| comment.block_id.as_deref() == Some(block_id))
        .cloned()
        .collect()
}

fn write_comments_jsonl(
    paper_id: &str,
    comments_path: &Path,
    path: &str,
    comments: &[PaperComment],
) -> Result<(), PaperCommentsError> {
    if let Some(parent) = comments_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            PaperCommentsError::write_failed(
                paper_id,
                path,
                format!("Failed to create comments sidecar directory: {error}"),
            )
        })?;
    }

    let mut content = String::new();
    for comment in comments {
        let line = serde_json::to_string(comment).map_err(|error| {
            PaperCommentsError::write_failed(
                paper_id,
                path,
                format!("Failed to serialize comment: {error}"),
            )
        })?;
        content.push_str(&line);
        content.push('\n');
    }

    fs::write(comments_path, content).map_err(|error| {
        PaperCommentsError::write_failed(
            paper_id,
            path,
            format!("Failed to write comments sidecar: {error}"),
        )
    })
}

fn parse_comment_line(
    paper_id: &str,
    line_number: usize,
    trimmed: &str,
) -> Result<PaperComment, Vec<PaperCommentsLineError>> {
    let value = match serde_json::from_str::<Value>(trimmed) {
        Ok(value) => value,
        Err(error) => {
            return Err(vec![line_error(
                line_number,
                "malformed_json",
                format!("Line is not valid JSON: {error}"),
            )]);
        }
    };

    let Some(object) = value.as_object() else {
        return Err(vec![line_error(
            line_number,
            "invalid_shape",
            "Line must be a JSON object",
        )]);
    };

    let errors = comment_validation_errors(paper_id, object, line_number);
    if !errors.is_empty() {
        return Err(errors);
    }

    serde_json::from_value::<PaperComment>(value).map_err(|error| {
        vec![line_error(
            line_number,
            "invalid_field",
            format!("PaperComment has an invalid field value: {error}"),
        )]
    })
}

fn validate_comment_for_write(
    paper_id: &str,
    comment: &PaperComment,
) -> Result<(), PaperCommentsError> {
    let value = serde_json::to_value(comment).map_err(|error| PaperCommentsError {
        kind: "invalid_comment".to_string(),
        message: format!("Failed to validate comment: {error}"),
        paper_id: paper_id.to_string(),
        path: String::new(),
        line_errors: vec![],
    })?;

    let object = value
        .as_object()
        .expect("serialized comment must be object");
    let line_errors = comment_validation_errors(paper_id, object, 1);
    if line_errors.is_empty() {
        return Ok(());
    }

    Err(PaperCommentsError {
        kind: "invalid_comment".to_string(),
        message: "PaperComment is invalid".to_string(),
        paper_id: paper_id.to_string(),
        path: String::new(),
        line_errors,
    })
}

fn comment_validation_errors(
    paper_id: &str,
    object: &serde_json::Map<String, Value>,
    line_number: usize,
) -> Vec<PaperCommentsLineError> {
    let mut errors = Vec::new();
    require_non_empty_string(object, "id", line_number, &mut errors);
    require_non_empty_string(object, "paper_id", line_number, &mut errors);
    require_non_empty_string(object, "kind", line_number, &mut errors);
    require_non_empty_string(object, "created_at", line_number, &mut errors);
    require_matching_paper_id(object, paper_id, line_number, &mut errors);
    require_allowed_kind(object, line_number, &mut errors);
    reject_deprecated_color(object, line_number, &mut errors);
    require_comment_target(object, line_number, &mut errors);
    errors
}

fn require_matching_paper_id(
    object: &serde_json::Map<String, Value>,
    paper_id: &str,
    line_number: usize,
    errors: &mut Vec<PaperCommentsLineError>,
) {
    if object.get("paper_id").and_then(Value::as_str) == Some(paper_id) {
        return;
    }
    errors.push(line_error(
        line_number,
        "paper_id_mismatch",
        format!("Comment paper_id must match `{paper_id}`"),
    ));
}

fn require_allowed_kind(
    object: &serde_json::Map<String, Value>,
    line_number: usize,
    errors: &mut Vec<PaperCommentsLineError>,
) {
    let Some(kind) = object.get("kind").and_then(Value::as_str) else {
        return;
    };
    if kind == "comment" {
        return;
    }
    errors.push(line_error(
        line_number,
        "invalid_kind",
        "Paper comment kind must be comment",
    ));
}

fn reject_deprecated_color(
    object: &serde_json::Map<String, Value>,
    line_number: usize,
    errors: &mut Vec<PaperCommentsLineError>,
) {
    if !object.contains_key("color") {
        return;
    }
    errors.push(line_error(
        line_number,
        "deprecated_field",
        "Paper comments must not include comment color",
    ));
}

fn require_comment_target(
    object: &serde_json::Map<String, Value>,
    line_number: usize,
    errors: &mut Vec<PaperCommentsLineError>,
) {
    if object
        .get("block_id")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.trim().is_empty())
    {
        return;
    }

    let has_page = object
        .get("page")
        .and_then(Value::as_u64)
        .is_some_and(|page| page > 0 && page <= u32::MAX as u64);
    let has_bbox = object
        .get("bbox")
        .and_then(Value::as_array)
        .is_some_and(|bbox| bbox.len() == 4 && bbox.iter().all(Value::is_number));

    if has_page && has_bbox {
        return;
    }

    errors.push(line_error(
        line_number,
        "missing_comment_target",
        "Comment must include block_id or page plus bbox",
    ));
}

fn require_non_empty_string(
    object: &serde_json::Map<String, Value>,
    field: &str,
    line_number: usize,
    errors: &mut Vec<PaperCommentsLineError>,
) {
    match object.get(field).and_then(Value::as_str) {
        Some(value) if !value.trim().is_empty() => {}
        Some(_) => errors.push(line_error(
            line_number,
            "missing_required_field",
            format!("Required field `{field}` must be a non-empty string"),
        )),
        None => errors.push(line_error(
            line_number,
            "missing_required_field",
            format!("Missing required field `{field}`"),
        )),
    }
}

fn line_error(line: usize, kind: &str, message: impl Into<String>) -> PaperCommentsLineError {
    PaperCommentsLineError {
        line,
        kind: kind.to_string(),
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn comment_json(id: &str, block_id: &str) -> String {
        format!(
            "{{\"id\":\"{id}\",\"paper_id\":\"paper-1\",\"block_id\":\"{block_id}\",\"kind\":\"comment\",\"created_at\":\"2026-07-02T10:15:00Z\",\"text\":\"marked\"}}\n"
        )
    }

    fn comment(id: &str, block_id: &str) -> PaperComment {
        PaperComment {
            id: id.to_string(),
            paper_id: "paper-1".to_string(),
            block_id: Some(block_id.to_string()),
            kind: PaperCommentKind::Comment,
            created_at: "2026-07-02T10:15:00Z".to_string(),
            text: Some("marked".to_string()),
            note: None,
            page: None,
            bbox: None,
            updated_at: None,
            deleted_at: None,
            extra: BTreeMap::new(),
        }
    }

    #[test]
    fn parses_valid_jsonl_and_preserves_unknown_fields() {
        let result = parse_comments_jsonl(
            "paper-1",
            "/vault/papers/paper-1/comments.jsonl",
            "{\"id\":\"ann-1\",\"paper_id\":\"paper-1\",\"block_id\":\"b1\",\"kind\":\"comment\",\"created_at\":\"2026-07-02T10:15:00Z\",\"note\":\"Why?\",\"source\":\"fixture\"}\n",
        )
        .unwrap();

        assert_eq!(result.state, PaperCommentsState::Ready);
        assert_eq!(result.comments.len(), 1);
        assert_eq!(result.comments[0].id, "ann-1");
        assert_eq!(
            result.comments[0].extra.get("source"),
            Some(&Value::String("fixture".to_string()))
        );
    }

    #[test]
    fn reports_malformed_jsonl_with_line_numbers() {
        let error = parse_comments_jsonl("paper-1", "comments.jsonl", "{not json}\n")
            .expect_err("expected malformed JSONL to fail");

        assert_eq!(error.kind, "invalid_jsonl");
        assert_eq!(error.line_errors[0].line, 1);
        assert_eq!(error.line_errors[0].kind, "malformed_json");
    }

    #[test]
    fn reports_missing_required_fields_and_targets() {
        let error = parse_comments_jsonl(
            "paper-1",
            "comments.jsonl",
            "{\"id\":\"ann-1\",\"paper_id\":\"paper-1\",\"kind\":\"comment\"}\n",
        )
        .expect_err("expected missing fields to fail");

        assert!(error
            .line_errors
            .iter()
            .any(|line_error| line_error.message.contains("created_at")));
        assert!(error
            .line_errors
            .iter()
            .any(|line_error| line_error.kind == "missing_comment_target"));
    }

    #[test]
    fn rejects_unknown_kind_and_deprecated_color() {
        let error = parse_comments_jsonl(
            "paper-1",
            "comments.jsonl",
            "{\"id\":\"ann-1\",\"paper_id\":\"paper-1\",\"block_id\":\"b1\",\"kind\":\"highlight\",\"color\":\"important\",\"created_at\":\"2026-07-02T10:15:00Z\"}\n",
        )
        .expect_err("expected unsupported values to fail");

        assert!(error
            .line_errors
            .iter()
            .any(|line_error| line_error.kind == "invalid_kind"));
        assert!(error
            .line_errors
            .iter()
            .any(|line_error| line_error.kind == "deprecated_field"));
    }

    #[test]
    fn reads_missing_and_empty_sidecar_states() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("comments.jsonl");
        let missing = read_paper_comments_file("paper-1", &path).unwrap();
        assert_eq!(missing.state, PaperCommentsState::Missing);

        fs::write(&path, "\n\n").unwrap();
        let empty = read_paper_comments_file("paper-1", &path).unwrap();
        assert_eq!(empty.state, PaperCommentsState::Empty);
    }

    #[test]
    fn saves_creates_and_updates_comments() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("comments.jsonl");

        let created = save_paper_comment_file("paper-1", &path, comment("ann-1", "b1"))
            .expect("comment should save");
        assert_eq!(created.comments.len(), 1);

        let mut updated_comment = comment("ann-1", "b2");
        updated_comment.note = Some("Why?".to_string());

        let updated = save_paper_comment_file("paper-1", &path, updated_comment).unwrap();
        assert_eq!(updated.comments.len(), 1);
        assert_eq!(updated.comments[0].block_id.as_deref(), Some("b2"));
        assert_eq!(updated.comments[0].kind, PaperCommentKind::Comment);
    }

    #[test]
    fn deletes_comment_by_rewriting_sidecar() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("comments.jsonl");
        fs::write(
            &path,
            comment_json("ann-1", "b1") + &comment_json("ann-2", "b2"),
        )
        .unwrap();

        let result = delete_paper_comment_file("paper-1", &path, "ann-1").unwrap();

        assert_eq!(result.comments.len(), 1);
        assert_eq!(result.comments[0].id, "ann-2");
    }

    #[test]
    fn resets_malformed_sidecar_to_empty_jsonl() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("comments.jsonl");
        fs::write(&path, "{not json}\n").unwrap();

        let result = reset_paper_comments_file("paper-1", &path).unwrap();

        assert_eq!(result.state, PaperCommentsState::Empty);
        assert!(result.comments.is_empty());
        assert_eq!(fs::read_to_string(path).unwrap(), "");
    }

    #[test]
    fn groups_comments_by_block_id() {
        let comments = vec![comment("ann-1", "b1"), comment("ann-2", "b2")];

        let grouped = comments_by_block(&comments, "b1");

        assert_eq!(grouped.len(), 1);
        assert_eq!(grouped[0].id, "ann-1");
    }
}
