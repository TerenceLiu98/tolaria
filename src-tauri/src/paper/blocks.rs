use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SourceBlock {
    pub id: String,
    pub paper_id: String,
    pub kind: String,
    pub page: u32,
    pub hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bbox: Option<Vec<f64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub section: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_asset: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parser: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaperBlocksState {
    Missing,
    Empty,
    Ready,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperBlocksLineError {
    pub line: usize,
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperBlocksReadResult {
    pub paper_id: String,
    pub path: String,
    pub state: PaperBlocksState,
    pub blocks: Vec<SourceBlock>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperBlockLookupResult {
    pub paper_id: String,
    pub block_id: String,
    pub path: String,
    pub state: PaperBlocksState,
    pub block: Option<SourceBlock>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperBlockSearchResult {
    pub paper_id: String,
    pub query: String,
    pub path: String,
    pub state: PaperBlocksState,
    pub blocks: Vec<SourceBlock>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperBlocksError {
    pub kind: String,
    pub message: String,
    pub paper_id: String,
    pub path: String,
    pub line_errors: Vec<PaperBlocksLineError>,
}

impl PaperBlocksError {
    pub fn boundary(paper_id: &str, message: String) -> Self {
        Self {
            kind: "active_vault_boundary".to_string(),
            message,
            paper_id: paper_id.to_string(),
            path: String::new(),
            line_errors: vec![],
        }
    }
}

pub fn read_paper_blocks_file(
    paper_id: &str,
    blocks_path: &Path,
) -> Result<PaperBlocksReadResult, PaperBlocksError> {
    let path = blocks_path.to_string_lossy().into_owned();
    if !blocks_path.exists() {
        return Ok(PaperBlocksReadResult {
            paper_id: paper_id.to_string(),
            path,
            state: PaperBlocksState::Missing,
            blocks: vec![],
        });
    }

    let content = fs::read_to_string(blocks_path).map_err(|error| PaperBlocksError {
        kind: "read_failed".to_string(),
        message: format!("Failed to read blocks sidecar: {error}"),
        paper_id: paper_id.to_string(),
        path: path.clone(),
        line_errors: vec![],
    })?;

    parse_blocks_jsonl(paper_id, &path, &content)
}

pub fn parse_blocks_jsonl(
    paper_id: &str,
    path: &str,
    content: &str,
) -> Result<PaperBlocksReadResult, PaperBlocksError> {
    let mut blocks = Vec::new();
    let mut errors = Vec::new();

    for (index, line) in content.lines().enumerate() {
        let line_number = index + 1;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        match parse_block_line(line_number, trimmed) {
            Ok(block) => blocks.push(block),
            Err(line_errors) => errors.extend(line_errors),
        }
    }

    if !errors.is_empty() {
        return Err(PaperBlocksError {
            kind: "invalid_jsonl".to_string(),
            message: "blocks.jsonl contains malformed SourceBlock lines".to_string(),
            paper_id: paper_id.to_string(),
            path: path.to_string(),
            line_errors: errors,
        });
    }

    Ok(PaperBlocksReadResult {
        paper_id: paper_id.to_string(),
        path: path.to_string(),
        state: if blocks.is_empty() {
            PaperBlocksState::Empty
        } else {
            PaperBlocksState::Ready
        },
        blocks,
    })
}

pub fn find_paper_block(
    paper_id: &str,
    blocks_path: &Path,
    block_id: &str,
) -> Result<PaperBlockLookupResult, PaperBlocksError> {
    let result = read_paper_blocks_file(paper_id, blocks_path)?;
    let block = result
        .blocks
        .iter()
        .find(|block| block.id == block_id)
        .cloned();

    Ok(PaperBlockLookupResult {
        paper_id: result.paper_id,
        block_id: block_id.to_string(),
        path: result.path,
        state: result.state,
        block,
    })
}

pub fn search_paper_blocks_file(
    paper_id: &str,
    blocks_path: &Path,
    query: &str,
) -> Result<PaperBlockSearchResult, PaperBlocksError> {
    let result = read_paper_blocks_file(paper_id, blocks_path)?;
    let blocks = search_source_blocks(&result.blocks, query);

    Ok(PaperBlockSearchResult {
        paper_id: result.paper_id,
        query: query.to_string(),
        path: result.path,
        state: result.state,
        blocks,
    })
}

pub fn search_source_blocks(blocks: &[SourceBlock], query: &str) -> Vec<SourceBlock> {
    let normalized_query = query.trim().to_lowercase();
    if normalized_query.is_empty() {
        return vec![];
    }

    blocks
        .iter()
        .filter(|block| searchable_text(block).contains(&normalized_query))
        .cloned()
        .collect()
}

pub fn sample_blocks_jsonl(paper_id: &str) -> String {
    format!(
        "{{\"id\":\"b0001\",\"paper_id\":\"{paper_id}\",\"kind\":\"title\",\"page\":1,\"text\":\"Attention Is All You Need\",\"hash\":\"sha256:fixture-title\"}}\n\
{{\"id\":\"b0002\",\"paper_id\":\"{paper_id}\",\"kind\":\"paragraph\",\"page\":2,\"text\":\"The Transformer allows for significantly more parallelization.\",\"hash\":\"sha256:fixture-paragraph\",\"section\":\"Introduction\",\"order\":2}}\n"
    )
}

fn parse_block_line(
    line_number: usize,
    trimmed: &str,
) -> Result<SourceBlock, Vec<PaperBlocksLineError>> {
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

    let mut errors = Vec::new();
    require_non_empty_string(object, "id", line_number, &mut errors);
    require_non_empty_string(object, "paper_id", line_number, &mut errors);
    require_non_empty_string(object, "kind", line_number, &mut errors);
    require_non_empty_string(object, "hash", line_number, &mut errors);
    require_positive_page(object, line_number, &mut errors);
    if !errors.is_empty() {
        return Err(errors);
    }

    serde_json::from_value::<SourceBlock>(value).map_err(|error| {
        vec![line_error(
            line_number,
            "invalid_field",
            format!("SourceBlock has an invalid field value: {error}"),
        )]
    })
}

fn searchable_text(block: &SourceBlock) -> String {
    [
        block.text.as_deref(),
        block.caption.as_deref(),
        block.section.as_deref(),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join("\n")
    .to_lowercase()
}

fn require_non_empty_string(
    object: &serde_json::Map<String, Value>,
    field: &str,
    line_number: usize,
    errors: &mut Vec<PaperBlocksLineError>,
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

fn require_positive_page(
    object: &serde_json::Map<String, Value>,
    line_number: usize,
    errors: &mut Vec<PaperBlocksLineError>,
) {
    match object.get("page").and_then(Value::as_u64) {
        Some(page) if page > 0 && page <= u32::MAX as u64 => {}
        Some(_) => errors.push(line_error(
            line_number,
            "missing_required_field",
            "Required field `page` must be a positive integer",
        )),
        None => errors.push(line_error(
            line_number,
            "missing_required_field",
            "Missing required field `page`",
        )),
    }
}

fn line_error(line: usize, kind: &str, message: impl Into<String>) -> PaperBlocksLineError {
    PaperBlocksLineError {
        line,
        kind: kind.to_string(),
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn parses_valid_jsonl_and_preserves_unknown_fields() {
        let result = parse_blocks_jsonl(
            "paper-1",
            "/vault/papers/paper-1/blocks.jsonl",
            "{\"id\":\"b1\",\"paper_id\":\"paper-1\",\"kind\":\"paragraph\",\"page\":1,\"text\":\"Hello\",\"hash\":\"sha256:1\",\"model\":\"fixture\"}\n",
        )
        .unwrap();

        assert_eq!(result.state, PaperBlocksState::Ready);
        assert_eq!(result.blocks.len(), 1);
        assert_eq!(result.blocks[0].id, "b1");
        assert_eq!(
            result.blocks[0].extra.get("model"),
            Some(&Value::String("fixture".to_string()))
        );
    }

    #[test]
    fn reports_malformed_jsonl_with_line_numbers() {
        let error = parse_blocks_jsonl("paper-1", "blocks.jsonl", "{not json}\n")
            .expect_err("expected malformed JSONL to fail");

        assert_eq!(error.kind, "invalid_jsonl");
        assert_eq!(error.line_errors[0].line, 1);
        assert_eq!(error.line_errors[0].kind, "malformed_json");
    }

    #[test]
    fn reports_missing_required_fields() {
        let error = parse_blocks_jsonl(
            "paper-1",
            "blocks.jsonl",
            "{\"id\":\"b1\",\"paper_id\":\"paper-1\",\"kind\":\"paragraph\",\"page\":1}\n",
        )
        .expect_err("expected missing hash to fail");

        assert_eq!(error.line_errors[0].kind, "missing_required_field");
        assert!(error.line_errors[0].message.contains("hash"));
    }

    #[test]
    fn reads_missing_and_empty_sidecar_states() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("blocks.jsonl");
        let missing_result = read_paper_blocks_file("paper-1", &missing).unwrap();
        assert_eq!(missing_result.state, PaperBlocksState::Missing);

        fs::write(&missing, "\n\n").unwrap();
        let empty_result = read_paper_blocks_file("paper-1", &missing).unwrap();
        assert_eq!(empty_result.state, PaperBlocksState::Empty);
    }

    #[test]
    fn looks_up_block_by_id() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("blocks.jsonl");
        fs::write(&path, sample_blocks_jsonl("paper-1")).unwrap();

        let result = find_paper_block("paper-1", &path, "b0002").unwrap();

        assert_eq!(result.block.unwrap().id, "b0002");
    }

    #[test]
    fn searches_block_text_case_insensitively() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("blocks.jsonl");
        fs::write(&path, sample_blocks_jsonl("paper-1")).unwrap();

        let result = search_paper_blocks_file("paper-1", &path, "transformer").unwrap();

        assert_eq!(result.blocks.len(), 1);
        assert_eq!(result.blocks[0].id, "b0002");
    }
}
