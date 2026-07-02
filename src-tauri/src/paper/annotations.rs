use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaperAnnotationKind {
    Highlight,
    Underline,
    Question,
    Comment,
    Bookmark,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaperAnnotationColor {
    Questioning,
    Important,
    Original,
    Pending,
    Conclusion,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PaperAnnotation {
    pub id: String,
    pub paper_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub block_id: Option<String>,
    pub kind: PaperAnnotationKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<PaperAnnotationColor>,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
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
pub enum PaperAnnotationsState {
    Missing,
    Empty,
    Ready,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperAnnotationsLineError {
    pub line: usize,
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperAnnotationsReadResult {
    pub paper_id: String,
    pub path: String,
    pub state: PaperAnnotationsState,
    pub annotations: Vec<PaperAnnotation>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperAnnotationsError {
    pub kind: String,
    pub message: String,
    pub paper_id: String,
    pub path: String,
    pub line_errors: Vec<PaperAnnotationsLineError>,
}

impl PaperAnnotationsError {
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

pub fn read_paper_annotations_file(
    paper_id: &str,
    annotations_path: &Path,
) -> Result<PaperAnnotationsReadResult, PaperAnnotationsError> {
    let path = annotations_path.to_string_lossy().into_owned();
    if !annotations_path.exists() {
        return Ok(PaperAnnotationsReadResult {
            paper_id: paper_id.to_string(),
            path,
            state: PaperAnnotationsState::Missing,
            annotations: vec![],
        });
    }

    let content = fs::read_to_string(annotations_path).map_err(|error| PaperAnnotationsError {
        kind: "read_failed".to_string(),
        message: format!("Failed to read annotations sidecar: {error}"),
        paper_id: paper_id.to_string(),
        path: path.clone(),
        line_errors: vec![],
    })?;

    parse_annotations_jsonl(paper_id, &path, &content)
}

pub fn parse_annotations_jsonl(
    paper_id: &str,
    path: &str,
    content: &str,
) -> Result<PaperAnnotationsReadResult, PaperAnnotationsError> {
    let mut annotations = Vec::new();
    let mut errors = Vec::new();

    for (index, line) in content.lines().enumerate() {
        let line_number = index + 1;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        match parse_annotation_line(paper_id, line_number, trimmed) {
            Ok(annotation) => annotations.push(annotation),
            Err(line_errors) => errors.extend(line_errors),
        }
    }

    if !errors.is_empty() {
        return Err(PaperAnnotationsError {
            kind: "invalid_jsonl".to_string(),
            message: "annotations.jsonl contains malformed PaperAnnotation lines".to_string(),
            paper_id: paper_id.to_string(),
            path: path.to_string(),
            line_errors: errors,
        });
    }

    Ok(PaperAnnotationsReadResult {
        paper_id: paper_id.to_string(),
        path: path.to_string(),
        state: if annotations.is_empty() {
            PaperAnnotationsState::Empty
        } else {
            PaperAnnotationsState::Ready
        },
        annotations,
    })
}

pub fn save_paper_annotation_file(
    paper_id: &str,
    annotations_path: &Path,
    annotation: PaperAnnotation,
) -> Result<PaperAnnotationsReadResult, PaperAnnotationsError> {
    let path = annotations_path.to_string_lossy().into_owned();
    validate_annotation_for_write(paper_id, &annotation)?;

    let mut annotations = read_paper_annotations_file(paper_id, annotations_path)?.annotations;
    match annotations
        .iter()
        .position(|existing| existing.id == annotation.id)
    {
        Some(index) => annotations[index] = annotation,
        None => annotations.push(annotation),
    }

    write_annotations_jsonl(paper_id, annotations_path, &path, &annotations)?;
    read_paper_annotations_file(paper_id, annotations_path)
}

pub fn delete_paper_annotation_file(
    paper_id: &str,
    annotations_path: &Path,
    annotation_id: &str,
) -> Result<PaperAnnotationsReadResult, PaperAnnotationsError> {
    let path = annotations_path.to_string_lossy().into_owned();
    let mut annotations = read_paper_annotations_file(paper_id, annotations_path)?.annotations;
    annotations.retain(|annotation| annotation.id != annotation_id);

    write_annotations_jsonl(paper_id, annotations_path, &path, &annotations)?;
    read_paper_annotations_file(paper_id, annotations_path)
}

pub fn reset_paper_annotations_file(
    paper_id: &str,
    annotations_path: &Path,
) -> Result<PaperAnnotationsReadResult, PaperAnnotationsError> {
    let path = annotations_path.to_string_lossy().into_owned();
    write_annotations_jsonl(paper_id, annotations_path, &path, &[])?;
    read_paper_annotations_file(paper_id, annotations_path)
}

pub fn annotations_by_block(
    annotations: &[PaperAnnotation],
    block_id: &str,
) -> Vec<PaperAnnotation> {
    annotations
        .iter()
        .filter(|annotation| annotation.block_id.as_deref() == Some(block_id))
        .cloned()
        .collect()
}

fn write_annotations_jsonl(
    paper_id: &str,
    annotations_path: &Path,
    path: &str,
    annotations: &[PaperAnnotation],
) -> Result<(), PaperAnnotationsError> {
    if let Some(parent) = annotations_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            PaperAnnotationsError::write_failed(
                paper_id,
                path,
                format!("Failed to create annotations sidecar directory: {error}"),
            )
        })?;
    }

    let mut content = String::new();
    for annotation in annotations {
        let line = serde_json::to_string(annotation).map_err(|error| {
            PaperAnnotationsError::write_failed(
                paper_id,
                path,
                format!("Failed to serialize annotation: {error}"),
            )
        })?;
        content.push_str(&line);
        content.push('\n');
    }

    fs::write(annotations_path, content).map_err(|error| {
        PaperAnnotationsError::write_failed(
            paper_id,
            path,
            format!("Failed to write annotations sidecar: {error}"),
        )
    })
}

fn parse_annotation_line(
    paper_id: &str,
    line_number: usize,
    trimmed: &str,
) -> Result<PaperAnnotation, Vec<PaperAnnotationsLineError>> {
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

    let errors = annotation_validation_errors(paper_id, object, line_number);
    if !errors.is_empty() {
        return Err(errors);
    }

    serde_json::from_value::<PaperAnnotation>(value).map_err(|error| {
        vec![line_error(
            line_number,
            "invalid_field",
            format!("PaperAnnotation has an invalid field value: {error}"),
        )]
    })
}

fn validate_annotation_for_write(
    paper_id: &str,
    annotation: &PaperAnnotation,
) -> Result<(), PaperAnnotationsError> {
    let value = serde_json::to_value(annotation).map_err(|error| PaperAnnotationsError {
        kind: "invalid_annotation".to_string(),
        message: format!("Failed to validate annotation: {error}"),
        paper_id: paper_id.to_string(),
        path: String::new(),
        line_errors: vec![],
    })?;

    let object = value.as_object().expect("serialized annotation must be object");
    let line_errors = annotation_validation_errors(paper_id, object, 1);
    if line_errors.is_empty() {
        return Ok(());
    }

    Err(PaperAnnotationsError {
        kind: "invalid_annotation".to_string(),
        message: "PaperAnnotation is invalid".to_string(),
        paper_id: paper_id.to_string(),
        path: String::new(),
        line_errors,
    })
}

fn annotation_validation_errors(
    paper_id: &str,
    object: &serde_json::Map<String, Value>,
    line_number: usize,
) -> Vec<PaperAnnotationsLineError> {
    let mut errors = Vec::new();
    require_non_empty_string(object, "id", line_number, &mut errors);
    require_non_empty_string(object, "paper_id", line_number, &mut errors);
    require_non_empty_string(object, "kind", line_number, &mut errors);
    require_non_empty_string(object, "created_at", line_number, &mut errors);
    require_matching_paper_id(object, paper_id, line_number, &mut errors);
    require_allowed_kind(object, line_number, &mut errors);
    require_allowed_color(object, line_number, &mut errors);
    require_annotation_target(object, line_number, &mut errors);
    errors
}

fn require_matching_paper_id(
    object: &serde_json::Map<String, Value>,
    paper_id: &str,
    line_number: usize,
    errors: &mut Vec<PaperAnnotationsLineError>,
) {
    if object.get("paper_id").and_then(Value::as_str) == Some(paper_id) {
        return;
    }
    errors.push(line_error(
        line_number,
        "paper_id_mismatch",
        format!("Annotation paper_id must match `{paper_id}`"),
    ));
}

fn require_allowed_kind(
    object: &serde_json::Map<String, Value>,
    line_number: usize,
    errors: &mut Vec<PaperAnnotationsLineError>,
) {
    let Some(kind) = object.get("kind").and_then(Value::as_str) else {
        return;
    };
    if matches!(
        kind,
        "highlight" | "underline" | "question" | "comment" | "bookmark"
    ) {
        return;
    }
    errors.push(line_error(
        line_number,
        "invalid_kind",
        "Annotation kind must be highlight, underline, question, comment, or bookmark",
    ));
}

fn require_allowed_color(
    object: &serde_json::Map<String, Value>,
    line_number: usize,
    errors: &mut Vec<PaperAnnotationsLineError>,
) {
    let Some(color) = object.get("color") else {
        return;
    };
    let Some(color) = color.as_str() else {
        errors.push(line_error(
            line_number,
            "invalid_color",
            "Annotation color must be a string",
        ));
        return;
    };
    if matches!(
        color,
        "questioning" | "important" | "original" | "pending" | "conclusion"
    ) {
        return;
    }
    errors.push(line_error(
        line_number,
        "invalid_color",
        "Annotation color must be questioning, important, original, pending, or conclusion",
    ));
}

fn require_annotation_target(
    object: &serde_json::Map<String, Value>,
    line_number: usize,
    errors: &mut Vec<PaperAnnotationsLineError>,
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
        "missing_annotation_target",
        "Annotation must include block_id or page plus bbox",
    ));
}

fn require_non_empty_string(
    object: &serde_json::Map<String, Value>,
    field: &str,
    line_number: usize,
    errors: &mut Vec<PaperAnnotationsLineError>,
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

fn line_error(line: usize, kind: &str, message: impl Into<String>) -> PaperAnnotationsLineError {
    PaperAnnotationsLineError {
        line,
        kind: kind.to_string(),
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn annotation_json(id: &str, block_id: &str) -> String {
        format!(
            "{{\"id\":\"{id}\",\"paper_id\":\"paper-1\",\"block_id\":\"{block_id}\",\"kind\":\"highlight\",\"color\":\"important\",\"created_at\":\"2026-07-02T10:15:00Z\",\"text\":\"marked\"}}\n"
        )
    }

    fn annotation(id: &str, block_id: &str) -> PaperAnnotation {
        PaperAnnotation {
            id: id.to_string(),
            paper_id: "paper-1".to_string(),
            block_id: Some(block_id.to_string()),
            kind: PaperAnnotationKind::Highlight,
            color: Some(PaperAnnotationColor::Important),
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
        let result = parse_annotations_jsonl(
            "paper-1",
            "/vault/papers/paper-1/annotations.jsonl",
            "{\"id\":\"ann-1\",\"paper_id\":\"paper-1\",\"block_id\":\"b1\",\"kind\":\"question\",\"color\":\"questioning\",\"created_at\":\"2026-07-02T10:15:00Z\",\"note\":\"Why?\",\"source\":\"fixture\"}\n",
        )
        .unwrap();

        assert_eq!(result.state, PaperAnnotationsState::Ready);
        assert_eq!(result.annotations.len(), 1);
        assert_eq!(result.annotations[0].id, "ann-1");
        assert_eq!(
            result.annotations[0].extra.get("source"),
            Some(&Value::String("fixture".to_string()))
        );
    }

    #[test]
    fn reports_malformed_jsonl_with_line_numbers() {
        let error = parse_annotations_jsonl("paper-1", "annotations.jsonl", "{not json}\n")
            .expect_err("expected malformed JSONL to fail");

        assert_eq!(error.kind, "invalid_jsonl");
        assert_eq!(error.line_errors[0].line, 1);
        assert_eq!(error.line_errors[0].kind, "malformed_json");
    }

    #[test]
    fn reports_missing_required_fields_and_targets() {
        let error = parse_annotations_jsonl(
            "paper-1",
            "annotations.jsonl",
            "{\"id\":\"ann-1\",\"paper_id\":\"paper-1\",\"kind\":\"highlight\"}\n",
        )
        .expect_err("expected missing fields to fail");

        assert!(error
            .line_errors
            .iter()
            .any(|line_error| line_error.message.contains("created_at")));
        assert!(error
            .line_errors
            .iter()
            .any(|line_error| line_error.kind == "missing_annotation_target"));
    }

    #[test]
    fn rejects_unknown_kind_and_color() {
        let error = parse_annotations_jsonl(
            "paper-1",
            "annotations.jsonl",
            "{\"id\":\"ann-1\",\"paper_id\":\"paper-1\",\"block_id\":\"b1\",\"kind\":\"ink\",\"color\":\"blue\",\"created_at\":\"2026-07-02T10:15:00Z\"}\n",
        )
        .expect_err("expected unsupported values to fail");

        assert!(error
            .line_errors
            .iter()
            .any(|line_error| line_error.kind == "invalid_kind"));
        assert!(error
            .line_errors
            .iter()
            .any(|line_error| line_error.kind == "invalid_color"));
    }

    #[test]
    fn reads_missing_and_empty_sidecar_states() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("annotations.jsonl");
        let missing = read_paper_annotations_file("paper-1", &path).unwrap();
        assert_eq!(missing.state, PaperAnnotationsState::Missing);

        fs::write(&path, "\n\n").unwrap();
        let empty = read_paper_annotations_file("paper-1", &path).unwrap();
        assert_eq!(empty.state, PaperAnnotationsState::Empty);
    }

    #[test]
    fn saves_creates_and_updates_annotations() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("annotations.jsonl");

        let created = save_paper_annotation_file("paper-1", &path, annotation("ann-1", "b1"))
            .expect("annotation should save");
        assert_eq!(created.annotations.len(), 1);

        let mut updated_annotation = annotation("ann-1", "b2");
        updated_annotation.kind = PaperAnnotationKind::Question;
        updated_annotation.note = Some("Why?".to_string());

        let updated =
            save_paper_annotation_file("paper-1", &path, updated_annotation).unwrap();
        assert_eq!(updated.annotations.len(), 1);
        assert_eq!(updated.annotations[0].block_id.as_deref(), Some("b2"));
        assert_eq!(updated.annotations[0].kind, PaperAnnotationKind::Question);
    }

    #[test]
    fn deletes_annotation_by_rewriting_sidecar() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("annotations.jsonl");
        fs::write(&path, annotation_json("ann-1", "b1") + &annotation_json("ann-2", "b2"))
            .unwrap();

        let result = delete_paper_annotation_file("paper-1", &path, "ann-1").unwrap();

        assert_eq!(result.annotations.len(), 1);
        assert_eq!(result.annotations[0].id, "ann-2");
    }

    #[test]
    fn resets_malformed_sidecar_to_empty_jsonl() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("annotations.jsonl");
        fs::write(&path, "{not json}\n").unwrap();

        let result = reset_paper_annotations_file("paper-1", &path).unwrap();

        assert_eq!(result.state, PaperAnnotationsState::Empty);
        assert!(result.annotations.is_empty());
        assert_eq!(fs::read_to_string(path).unwrap(), "");
    }

    #[test]
    fn groups_annotations_by_block_id() {
        let annotations = vec![annotation("ann-1", "b1"), annotation("ann-2", "b2")];

        let grouped = annotations_by_block(&annotations, "b1");

        assert_eq!(grouped.len(), 1);
        assert_eq!(grouped[0].id, "ann-1");
    }
}
