use chrono::{Datelike, Utc};
use regex::Regex;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::frontmatter::{update_frontmatter_content, FrontmatterValue};

const OPENALEX_API_BASE: &str = "https://api.openalex.org";
const OPENALEX_WORK_SELECT_FIELDS: &str = "id,display_name,doi,authorships,publication_year,publication_date,primary_location,type,abstract_inverted_index,ids";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaperMetadataStatus {
    Missing,
    Ready,
    NeedsReview,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaperVenueType {
    Journal,
    Conference,
    Workshop,
    Preprint,
    Book,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaperPublicationStage {
    Preprint,
    Published,
    Accepted,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PaperMetadataValues {
    pub title: Option<String>,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub venue_short: Option<String>,
    pub venue_type: Option<PaperVenueType>,
    pub publication_date: Option<String>,
    pub publication_stage: Option<PaperPublicationStage>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    #[serde(rename = "abstract")]
    pub abstract_text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperMetadataSource {
    pub provider: String,
    pub identifier: Option<String>,
    pub confidence: f64,
    pub matched_by: String,
    pub metadata: PaperMetadataValues,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperMetadataCandidate {
    pub id: String,
    pub provider: String,
    pub confidence: f64,
    pub reason: String,
    pub metadata: PaperMetadataValues,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperMetadataError {
    pub provider: String,
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperMetadata {
    pub paper_id: String,
    pub status: PaperMetadataStatus,
    pub confidence: f64,
    pub updated_at: Option<String>,
    #[serde(flatten)]
    pub values: PaperMetadataValues,
    pub sources: Vec<PaperMetadataSource>,
    pub candidates: Vec<PaperMetadataCandidate>,
    pub errors: Vec<PaperMetadataError>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperMetadataReadResult {
    pub paper_id: String,
    pub path: PathBuf,
    pub state: PaperMetadataSidecarState,
    pub metadata: Option<PaperMetadata>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaperMetadataSidecarState {
    Missing,
    Empty,
    Ready,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperMetadataErrorResult {
    pub kind: String,
    pub message: String,
    pub paper_id: String,
    pub path: String,
}

impl PaperMetadataErrorResult {
    pub fn boundary(paper_id: &str, message: impl Into<String>) -> Self {
        Self {
            kind: "active_vault_boundary".to_string(),
            message: message.into(),
            paper_id: paper_id.to_string(),
            path: String::new(),
        }
    }
}

pub fn read_paper_metadata_file(
    paper_id: &str,
    metadata_path: &Path,
) -> Result<PaperMetadataReadResult, PaperMetadataErrorResult> {
    if !metadata_path.exists() {
        return Ok(PaperMetadataReadResult {
            paper_id: paper_id.to_string(),
            path: metadata_path.to_path_buf(),
            state: PaperMetadataSidecarState::Missing,
            metadata: None,
        });
    }

    let content = fs::read_to_string(metadata_path)
        .map_err(|error| metadata_error(paper_id, metadata_path, "read_failed", error))?;
    if content.trim().is_empty() {
        return Ok(PaperMetadataReadResult {
            paper_id: paper_id.to_string(),
            path: metadata_path.to_path_buf(),
            state: PaperMetadataSidecarState::Empty,
            metadata: None,
        });
    }

    let metadata = serde_json::from_str::<PaperMetadata>(&content).map_err(|error| {
        PaperMetadataErrorResult {
            kind: "malformed_json".to_string(),
            message: format!("metadata.json is not valid PaperMetadata JSON: {error}"),
            paper_id: paper_id.to_string(),
            path: metadata_path.display().to_string(),
        }
    })?;
    Ok(PaperMetadataReadResult {
        paper_id: paper_id.to_string(),
        path: metadata_path.to_path_buf(),
        state: PaperMetadataSidecarState::Ready,
        metadata: Some(metadata),
    })
}

pub fn extract_paper_metadata_file(
    paper_id: &str,
    paper_path: &Path,
    source_pdf_path: &Path,
    metadata_path: &Path,
) -> Result<PaperMetadata, PaperMetadataErrorResult> {
    let paper_content = fs::read_to_string(paper_path)
        .map_err(|error| metadata_error(paper_id, paper_path, "read_failed", error))?;
    let pdf_metadata = extract_pdf_document_metadata(source_pdf_path);
    let markdown_metadata = extract_markdown_metadata(&paper_content);
    let mut sources = Vec::new();
    let mut errors = Vec::new();
    let mut local_query = PaperMetadataValues::default();

    match pdf_metadata {
        Ok(source) => {
            local_query = merge_values(local_query, source.metadata.clone());
            sources.push(source);
        }
        Err(error) => errors.push(error),
    }
    local_query = merge_values(local_query, markdown_metadata.clone());
    sources.push(PaperMetadataSource {
        provider: "parsed_markdown".to_string(),
        identifier: None,
        confidence: markdown_metadata_confidence(&markdown_metadata),
        matched_by: "paper_md_heuristic".to_string(),
        metadata: markdown_metadata,
    });
    match resolve_openalex_metadata(&local_query) {
        Ok(openalex_sources) => sources.extend(openalex_sources),
        Err(error) => errors.push(error),
    }

    let metadata = merge_metadata_sources(paper_id, sources, errors);
    write_paper_metadata_file(metadata_path, &metadata)?;
    sync_paper_metadata_frontmatter(paper_path, &metadata)?;
    Ok(metadata)
}

pub fn refresh_paper_metadata_file(
    paper_id: &str,
    paper_path: &Path,
    source_pdf_path: &Path,
    metadata_path: &Path,
) -> Result<PaperMetadata, PaperMetadataErrorResult> {
    let paper_content = fs::read_to_string(paper_path)
        .map_err(|error| metadata_error(paper_id, paper_path, "read_failed", error))?;
    let pdf_metadata = extract_pdf_document_metadata(source_pdf_path);
    let markdown_metadata = extract_markdown_metadata(&paper_content);
    let frontmatter_metadata = extract_frontmatter_metadata(&paper_content);
    let mut sources = Vec::new();
    let mut errors = Vec::new();
    let mut local_query = PaperMetadataValues::default();

    match pdf_metadata {
        Ok(source) => {
            local_query = merge_values(local_query, source.metadata.clone());
            sources.push(source);
        }
        Err(error) => errors.push(error),
    }

    local_query = merge_values(local_query, markdown_metadata.clone());
    sources.push(PaperMetadataSource {
        provider: "parsed_markdown".to_string(),
        identifier: None,
        confidence: markdown_metadata_confidence(&markdown_metadata),
        matched_by: "paper_md_heuristic".to_string(),
        metadata: markdown_metadata,
    });

    if metadata_has_user_visible_values(&frontmatter_metadata) {
        local_query = merge_values(local_query, frontmatter_metadata.clone());
        sources.push(PaperMetadataSource {
            provider: "paper_frontmatter".to_string(),
            identifier: None,
            confidence: frontmatter_metadata_confidence(&frontmatter_metadata),
            matched_by: "user_visible_properties".to_string(),
            metadata: frontmatter_metadata.clone(),
        });
    }

    let provider_query = refresh_provider_query(&local_query, &frontmatter_metadata);
    match resolve_openalex_metadata(&provider_query) {
        Ok(openalex_sources) => sources.extend(openalex_sources),
        Err(error) => errors.push(error),
    }

    let metadata = merge_refresh_metadata_sources(paper_id, sources, errors);
    write_paper_metadata_file(metadata_path, &metadata)?;
    sync_paper_metadata_frontmatter(paper_path, &metadata)?;
    Ok(metadata)
}

pub fn apply_paper_metadata_candidate_file(
    paper_id: &str,
    paper_path: &Path,
    metadata_path: &Path,
    candidate_id: &str,
) -> Result<PaperMetadata, PaperMetadataErrorResult> {
    let mut metadata = read_paper_metadata_file(paper_id, metadata_path)?
        .metadata
        .ok_or_else(|| PaperMetadataErrorResult {
            kind: "metadata_missing".to_string(),
            message: "metadata.json has no candidates to apply".to_string(),
            paper_id: paper_id.to_string(),
            path: metadata_path.display().to_string(),
        })?;
    let candidate = metadata
        .candidates
        .iter()
        .find(|candidate| candidate.id == candidate_id)
        .cloned()
        .ok_or_else(|| PaperMetadataErrorResult {
            kind: "candidate_missing".to_string(),
            message: format!("Metadata candidate `{candidate_id}` was not found"),
            paper_id: paper_id.to_string(),
            path: metadata_path.display().to_string(),
        })?;

    metadata.values = merge_values(metadata.values, candidate.metadata.clone());
    metadata.confidence = candidate.confidence;
    metadata.status = PaperMetadataStatus::Ready;
    metadata.updated_at = Some(Utc::now().to_rfc3339());
    metadata.sources.push(PaperMetadataSource {
        provider: candidate.provider,
        identifier: Some(candidate.id.clone()),
        confidence: candidate.confidence,
        matched_by: "manual_candidate_apply".to_string(),
        metadata: candidate.metadata,
    });
    metadata
        .candidates
        .retain(|candidate| candidate.id != candidate_id);
    write_paper_metadata_file(metadata_path, &metadata)?;
    sync_paper_metadata_frontmatter(paper_path, &metadata)?;
    Ok(metadata)
}

pub fn save_paper_metadata_file(
    paper_id: &str,
    paper_path: &Path,
    metadata_path: &Path,
    values: PaperMetadataValues,
) -> Result<PaperMetadata, PaperMetadataErrorResult> {
    let mut metadata = read_paper_metadata_file(paper_id, metadata_path)?
        .metadata
        .unwrap_or_else(|| PaperMetadata {
            paper_id: paper_id.to_string(),
            status: PaperMetadataStatus::Ready,
            confidence: 1.0,
            updated_at: None,
            values: PaperMetadataValues::default(),
            sources: Vec::new(),
            candidates: Vec::new(),
            errors: Vec::new(),
        });

    metadata.values = values.clone();
    metadata.status = PaperMetadataStatus::Ready;
    metadata.confidence = 1.0;
    metadata.updated_at = Some(Utc::now().to_rfc3339());
    metadata.candidates.clear();
    metadata.sources.push(PaperMetadataSource {
        provider: "manual".to_string(),
        identifier: None,
        confidence: 1.0,
        matched_by: "user_edit".to_string(),
        metadata: values,
    });

    write_paper_metadata_file(metadata_path, &metadata)?;
    sync_paper_metadata_frontmatter(paper_path, &metadata)?;
    Ok(metadata)
}

pub fn extract_doi(text: &str) -> Option<String> {
    let regex = Regex::new(r"(?i)\b10\.\d{4,9}/[-._;()/:A-Z0-9]+\b").ok()?;
    regex
        .find(text)
        .map(|matched| normalize_doi(matched.as_str()))
}

pub fn extract_arxiv_id(text: &str) -> Option<String> {
    let url = Regex::new(r"(?i)\barxiv\.org/(?:abs|pdf)/([0-9]{4}\.[0-9]{4,5})(v[0-9]+)?").ok()?;
    if let Some(captures) = url.captures(text) {
        return captures.get(1).map(|id| id.as_str().to_string());
    }

    let modern = Regex::new(r"(?i)\barxiv[:\s]*([0-9]{4}\.[0-9]{4,5})(v[0-9]+)?\b").ok()?;
    if let Some(captures) = modern.captures(text) {
        return captures.get(1).map(|id| id.as_str().to_string());
    }

    let legacy =
        Regex::new(r"(?i)\barxiv[:\s]*([a-z-]+(?:\.[A-Z]{2})?/[0-9]{7})(v[0-9]+)?\b").ok()?;
    legacy
        .captures(text)
        .and_then(|captures| captures.get(1).map(|id| id.as_str().to_string()))
}

pub fn normalize_crossref_work(value: &Value) -> Option<PaperMetadataValues> {
    let message = value.get("message").unwrap_or(value);
    let title = message
        .get("title")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(Value::as_str)
        .map(clean_string);
    let authors = message
        .get("author")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(crossref_author_name).collect())
        .unwrap_or_default();
    let doi = message
        .get("DOI")
        .and_then(Value::as_str)
        .map(normalize_doi);
    let publication_date = crossref_date(message);
    let year = publication_date
        .as_deref()
        .and_then(|date| date.get(0..4))
        .and_then(|year| year.parse::<i32>().ok());
    let venue = message
        .get("container-title")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(Value::as_str)
        .map(clean_string);
    let venue_type = message
        .get("type")
        .and_then(Value::as_str)
        .map(classify_crossref_type)
        .or(Some(PaperVenueType::Unknown));

    Some(PaperMetadataValues {
        title,
        authors,
        year,
        venue,
        venue_short: None,
        venue_type,
        publication_date,
        publication_stage: Some(PaperPublicationStage::Published),
        doi,
        arxiv_id: None,
        abstract_text: message
            .get("abstract")
            .and_then(Value::as_str)
            .map(strip_htmlish),
    })
}

pub fn normalize_openalex_work(value: &Value) -> Option<PaperMetadataValues> {
    let title = value
        .get("display_name")
        .and_then(Value::as_str)
        .map(clean_string);
    let doi = value.get("doi").and_then(Value::as_str).map(normalize_doi);
    let authors = value
        .get("authorships")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(openalex_author_name).collect())
        .unwrap_or_default();
    let venue = value
        .get("primary_location")
        .and_then(|location| location.get("source"))
        .and_then(|source| source.get("display_name"))
        .and_then(Value::as_str)
        .map(clean_string);
    let source_type = value
        .get("primary_location")
        .and_then(|location| location.get("source"))
        .and_then(|source| source.get("type"))
        .and_then(Value::as_str);
    let work_type = value.get("type").and_then(Value::as_str);
    Some(PaperMetadataValues {
        title,
        authors,
        year: value
            .get("publication_year")
            .and_then(Value::as_i64)
            .and_then(|year| i32::try_from(year).ok()),
        venue_short: openalex_venue_short(venue.as_deref()),
        venue,
        venue_type: source_type
            .map(classify_openalex_source_type)
            .or_else(|| work_type.map(classify_openalex_work_type))
            .or(Some(PaperVenueType::Unknown)),
        publication_date: value
            .get("publication_date")
            .and_then(Value::as_str)
            .map(clean_string),
        publication_stage: Some(classify_openalex_publication_stage(source_type, work_type)),
        doi,
        arxiv_id: extract_openalex_arxiv_id(value),
        abstract_text: openalex_abstract(value),
    })
}

fn resolve_openalex_metadata(
    query: &PaperMetadataValues,
) -> Result<Vec<PaperMetadataSource>, PaperMetadataError> {
    #[cfg(test)]
    if std::env::var("TOLARIA_ENABLE_OPENALEX_METADATA_TESTS").is_err() {
        return Ok(Vec::new());
    }

    let Some(request) = openalex_request_for_metadata(query) else {
        return Ok(Vec::new());
    };
    let client = Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| PaperMetadataError {
            provider: "openalex".to_string(),
            kind: "http_client_failed".to_string(),
            message: format!("Failed to create OpenAlex metadata client: {error}"),
        })?;
    let response = client
        .get(&request.url)
        .header("User-Agent", "Sapientia Paper Metadata Resolver")
        .send()
        .map_err(|error| PaperMetadataError {
            provider: "openalex".to_string(),
            kind: "request_failed".to_string(),
            message: format!("OpenAlex metadata request failed: {error}"),
        })?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(Vec::new());
    }
    if !response.status().is_success() {
        return Err(PaperMetadataError {
            provider: "openalex".to_string(),
            kind: "http_status".to_string(),
            message: format!("OpenAlex metadata request returned {}", response.status()),
        });
    }
    let value = response
        .json::<Value>()
        .map_err(|error| PaperMetadataError {
            provider: "openalex".to_string(),
            kind: "malformed_response".to_string(),
            message: format!("OpenAlex metadata response was not valid JSON: {error}"),
        })?;
    Ok(openalex_sources_from_response(&request, &value))
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct OpenAlexMetadataRequest {
    url: String,
    matched_by: String,
    query_title: Option<String>,
}

fn openalex_request_for_metadata(query: &PaperMetadataValues) -> Option<OpenAlexMetadataRequest> {
    if let Some(doi) = query.doi.as_deref().filter(|doi| !doi.trim().is_empty()) {
        return Some(OpenAlexMetadataRequest {
            url: openalex_doi_url(doi),
            matched_by: "doi".to_string(),
            query_title: query.title.clone(),
        });
    }
    let title = query.title.as_deref()?.trim();
    if title.len() < 8 {
        return None;
    }
    Some(OpenAlexMetadataRequest {
        url: openalex_title_search_url(title),
        matched_by: "title_search".to_string(),
        query_title: Some(title.to_string()),
    })
}

fn openalex_doi_url(doi: &str) -> String {
    let normalized_doi = normalize_doi(doi);
    format!("{OPENALEX_API_BASE}/works/doi:{normalized_doi}?select={OPENALEX_WORK_SELECT_FIELDS}")
}

fn openalex_title_search_url(title: &str) -> String {
    let mut url = reqwest::Url::parse(&format!("{OPENALEX_API_BASE}/works"))
        .expect("OpenAlex base URL must be valid");
    let quoted_title = format!("\"{title}\"");
    url.query_pairs_mut()
        .append_pair("search.semantic", &quoted_title)
        .append_pair("per-page", "3")
        .append_pair("select", OPENALEX_WORK_SELECT_FIELDS);
    if let Ok(api_key) = std::env::var("OPENALEX_API_KEY") {
        if !api_key.trim().is_empty() {
            url.query_pairs_mut().append_pair("api_key", api_key.trim());
        }
    }
    url.to_string()
}

fn openalex_sources_from_response(
    request: &OpenAlexMetadataRequest,
    value: &Value,
) -> Vec<PaperMetadataSource> {
    if request.matched_by == "doi" {
        return normalize_openalex_work(value)
            .map(|metadata| {
                vec![PaperMetadataSource {
                    provider: "openalex".to_string(),
                    identifier: openalex_identifier(value),
                    confidence: 0.98,
                    matched_by: "doi".to_string(),
                    metadata,
                }]
            })
            .unwrap_or_default();
    }

    let Some(results) = value.get("results").and_then(Value::as_array) else {
        return Vec::new();
    };
    results
        .iter()
        .take(3)
        .filter_map(|work| {
            let metadata = normalize_openalex_work(work)?;
            let confidence = openalex_title_confidence(
                request.query_title.as_deref(),
                metadata.title.as_deref(),
            );
            Some(PaperMetadataSource {
                provider: "openalex".to_string(),
                identifier: openalex_identifier(work),
                confidence,
                matched_by: "title_search".to_string(),
                metadata,
            })
        })
        .collect()
}

fn openalex_title_confidence(query_title: Option<&str>, result_title: Option<&str>) -> f64 {
    let Some(query_title) = query_title else {
        return 0.72;
    };
    let Some(result_title) = result_title else {
        return 0.65;
    };
    let query = normalize_title_for_match(query_title);
    let result = normalize_title_for_match(result_title);
    if query == result {
        0.9
    } else if result.contains(&query) || query.contains(&result) {
        0.82
    } else {
        0.72
    }
}

fn normalize_title_for_match(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_alphanumeric() || ch.is_whitespace())
        .collect::<String>()
        .to_ascii_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn openalex_identifier(value: &Value) -> Option<String> {
    value.get("id").and_then(Value::as_str).map(clean_string)
}

fn openalex_abstract(value: &Value) -> Option<String> {
    let inverted = value.get("abstract_inverted_index")?.as_object()?;
    let mut words = Vec::new();
    for (word, positions) in inverted {
        for position in positions.as_array()?.iter().filter_map(Value::as_u64) {
            words.push((position, word.clone()));
        }
    }
    words.sort_by_key(|(position, _)| *position);
    let abstract_text = words
        .into_iter()
        .map(|(_, word)| word)
        .collect::<Vec<_>>()
        .join(" ");
    (!abstract_text.is_empty()).then_some(abstract_text)
}

fn extract_openalex_arxiv_id(value: &Value) -> Option<String> {
    value
        .get("ids")
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(|ids| ids.values())
        .filter_map(Value::as_str)
        .find_map(extract_arxiv_id)
        .or_else(|| {
            value
                .get("primary_location")
                .and_then(|location| location.get("landing_page_url"))
                .and_then(Value::as_str)
                .and_then(extract_arxiv_id)
        })
}

pub fn normalize_arxiv_entry(value: &Value) -> Option<PaperMetadataValues> {
    let title = value.get("title").and_then(Value::as_str).map(clean_string);
    let authors = value
        .get("authors")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(clean_string))
                .collect()
        })
        .unwrap_or_default();
    let published = value
        .get("published")
        .and_then(Value::as_str)
        .map(clean_string);
    let arxiv_id = value
        .get("id")
        .and_then(Value::as_str)
        .and_then(extract_arxiv_id)
        .or_else(|| {
            value
                .get("arxiv_id")
                .and_then(Value::as_str)
                .map(clean_string)
        });
    Some(PaperMetadataValues {
        title,
        authors,
        year: published
            .as_deref()
            .and_then(|date| date.get(0..4))
            .and_then(|year| year.parse::<i32>().ok()),
        venue: Some("arXiv".to_string()),
        venue_short: Some("arXiv".to_string()),
        venue_type: Some(PaperVenueType::Preprint),
        publication_date: published,
        publication_stage: Some(PaperPublicationStage::Preprint),
        doi: value.get("doi").and_then(Value::as_str).map(normalize_doi),
        arxiv_id,
        abstract_text: value
            .get("summary")
            .and_then(Value::as_str)
            .map(clean_string),
    })
}

fn metadata_error(
    paper_id: &str,
    path: &Path,
    kind: &str,
    error: impl std::fmt::Display,
) -> PaperMetadataErrorResult {
    PaperMetadataErrorResult {
        kind: kind.to_string(),
        message: format!(
            "Paper metadata operation failed for {}: {error}",
            path.display()
        ),
        paper_id: paper_id.to_string(),
        path: path.display().to_string(),
    }
}

fn write_paper_metadata_file(
    metadata_path: &Path,
    metadata: &PaperMetadata,
) -> Result<(), PaperMetadataErrorResult> {
    if let Some(parent) = metadata_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            metadata_error(&metadata.paper_id, metadata_path, "write_failed", error)
        })?;
    }
    let content = serde_json::to_string_pretty(metadata).map_err(|error| {
        metadata_error(&metadata.paper_id, metadata_path, "serialize_failed", error)
    })?;
    fs::write(metadata_path, format!("{content}\n"))
        .map_err(|error| metadata_error(&metadata.paper_id, metadata_path, "write_failed", error))
}

fn sync_paper_metadata_frontmatter(
    paper_path: &Path,
    metadata: &PaperMetadata,
) -> Result<(), PaperMetadataErrorResult> {
    let content = fs::read_to_string(paper_path)
        .map_err(|error| metadata_error(&metadata.paper_id, paper_path, "read_failed", error))?;
    let fields = metadata_frontmatter_fields(metadata);
    let mut updated = content;
    for (key, value) in fields {
        updated = update_frontmatter_content(&updated, key, value).map_err(|error| {
            metadata_error(&metadata.paper_id, paper_path, "frontmatter_failed", error)
        })?;
    }
    fs::write(paper_path, updated)
        .map_err(|error| metadata_error(&metadata.paper_id, paper_path, "write_failed", error))
}

fn metadata_frontmatter_fields(
    metadata: &PaperMetadata,
) -> Vec<(&'static str, Option<FrontmatterValue>)> {
    let values = &metadata.values;
    vec![
        (
            "title",
            values
                .title
                .as_ref()
                .map(|value| FrontmatterValue::String(value.clone())),
        ),
        (
            "authors",
            (!values.authors.is_empty()).then(|| FrontmatterValue::List(values.authors.clone())),
        ),
        (
            "year",
            values
                .year
                .map(|value| FrontmatterValue::Number(f64::from(value))),
        ),
        (
            "venue",
            values
                .venue
                .as_ref()
                .map(|value| FrontmatterValue::String(value.clone())),
        ),
        (
            "venue_short",
            values
                .venue_short
                .as_ref()
                .map(|value| FrontmatterValue::String(value.clone())),
        ),
        (
            "venue_type",
            values
                .venue_type
                .as_ref()
                .map(|value| FrontmatterValue::String(format_enum(value))),
        ),
        (
            "publication_date",
            values
                .publication_date
                .as_ref()
                .map(|value| FrontmatterValue::String(value.clone())),
        ),
        (
            "publication_stage",
            values
                .publication_stage
                .as_ref()
                .map(|value| FrontmatterValue::String(format_enum(value))),
        ),
        (
            "doi",
            values
                .doi
                .as_ref()
                .map(|value| FrontmatterValue::String(value.clone())),
        ),
        (
            "arxiv_id",
            values
                .arxiv_id
                .as_ref()
                .map(|value| FrontmatterValue::String(value.clone())),
        ),
        (
            "metadata_status",
            Some(FrontmatterValue::String(format_enum(&metadata.status))),
        ),
        (
            "metadata_confidence",
            Some(FrontmatterValue::Number(
                (metadata.confidence * 100.0).round() / 100.0,
            )),
        ),
    ]
}

fn format_enum<T: Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|value| value.as_str().map(ToString::to_string))
        .unwrap_or_else(|| "unknown".to_string())
}

fn extract_pdf_document_metadata(
    source_pdf_path: &Path,
) -> Result<PaperMetadataSource, PaperMetadataError> {
    if !source_pdf_path.exists() {
        return Err(PaperMetadataError {
            provider: "local_pdf".to_string(),
            kind: "source_pdf_missing".to_string(),
            message: format!("source.pdf does not exist: {}", source_pdf_path.display()),
        });
    }
    let bytes = fs::read(source_pdf_path).map_err(|error| PaperMetadataError {
        provider: "local_pdf".to_string(),
        kind: "read_failed".to_string(),
        message: format!("Failed to read source.pdf metadata: {error}"),
    })?;
    let text = String::from_utf8_lossy(&bytes);
    let title = extract_pdf_info_field(&text, "Title");
    let authors = extract_pdf_info_field(&text, "Author")
        .map(|author| split_authors(&author))
        .unwrap_or_default();
    let mut metadata = PaperMetadataValues {
        title,
        authors,
        doi: extract_doi(&text),
        arxiv_id: extract_arxiv_id(&text),
        ..PaperMetadataValues::default()
    };
    metadata.year = extract_year(&text);
    Ok(PaperMetadataSource {
        provider: "local_pdf".to_string(),
        identifier: None,
        confidence: if metadata.title.is_some() { 0.62 } else { 0.35 },
        matched_by: "pdf_info_dictionary".to_string(),
        metadata,
    })
}

fn extract_pdf_info_field(text: &str, key: &str) -> Option<String> {
    let pattern = format!(r"/{}\s*\(([^)]{{2,300}})\)", regex::escape(key));
    Regex::new(&pattern)
        .ok()?
        .captures(text)
        .and_then(|captures| captures.get(1))
        .map(|value| clean_string(value.as_str()))
        .filter(|value| !value.is_empty())
}

fn extract_markdown_metadata(content: &str) -> PaperMetadataValues {
    let plain = strip_yaml_and_anchors(content);
    let lines: Vec<String> = plain
        .lines()
        .map(clean_markdown_line)
        .filter(|line| !line.is_empty())
        .collect();
    let title = first_title(&lines);
    let abstract_text = extract_abstract(&lines);
    let authors = extract_authors(&lines, title.as_deref());
    PaperMetadataValues {
        title,
        authors,
        year: extract_year(&plain),
        venue: None,
        venue_short: None,
        venue_type: None,
        publication_date: None,
        publication_stage: None,
        doi: extract_doi(&plain),
        arxiv_id: extract_arxiv_id(&plain),
        abstract_text,
    }
}

fn extract_frontmatter_metadata(content: &str) -> PaperMetadataValues {
    let Some(block) = frontmatter_yaml_block(content) else {
        return PaperMetadataValues::default();
    };
    let Ok(value) = serde_yaml::from_str::<serde_yaml::Value>(block) else {
        return extract_frontmatter_metadata_from_lines(block);
    };
    let Some(mapping) = value.as_mapping() else {
        return extract_frontmatter_metadata_from_lines(block);
    };

    PaperMetadataValues {
        title: yaml_string(mapping, "title"),
        authors: yaml_string_vec(mapping, "authors"),
        year: yaml_i32(mapping, "year"),
        venue: yaml_string(mapping, "venue"),
        venue_short: yaml_string(mapping, "venue_short"),
        venue_type: yaml_string(mapping, "venue_type").and_then(|value| parse_venue_type(&value)),
        publication_date: yaml_string(mapping, "publication_date"),
        publication_stage: yaml_string(mapping, "publication_stage")
            .and_then(|value| parse_publication_stage(&value)),
        doi: yaml_string(mapping, "doi").map(|value| normalize_doi(&value)),
        arxiv_id: yaml_string(mapping, "arxiv_id")
            .or_else(|| yaml_string(mapping, "arxiv"))
            .map(|value| {
                extract_arxiv_id(&value)
                    .unwrap_or_else(|| value.trim().trim_start_matches("arXiv:").to_string())
            }),
        abstract_text: yaml_string(mapping, "abstract"),
    }
}

fn extract_frontmatter_metadata_from_lines(block: &str) -> PaperMetadataValues {
    PaperMetadataValues {
        title: frontmatter_line_scalar(block, "title"),
        authors: frontmatter_line_list(block, "authors").unwrap_or_else(|| {
            frontmatter_line_scalar(block, "authors")
                .map(|value| split_authors(&value))
                .unwrap_or_default()
        }),
        year: frontmatter_line_scalar(block, "year").and_then(|value| value.parse::<i32>().ok()),
        venue: frontmatter_line_scalar(block, "venue"),
        venue_short: frontmatter_line_scalar(block, "venue_short"),
        venue_type: frontmatter_line_scalar(block, "venue_type")
            .and_then(|value| parse_venue_type(&value)),
        publication_date: frontmatter_line_scalar(block, "publication_date"),
        publication_stage: frontmatter_line_scalar(block, "publication_stage")
            .and_then(|value| parse_publication_stage(&value)),
        doi: frontmatter_line_scalar(block, "doi").map(|value| normalize_doi(&value)),
        arxiv_id: frontmatter_line_scalar(block, "arxiv_id")
            .or_else(|| frontmatter_line_scalar(block, "arxiv"))
            .map(|value| {
                extract_arxiv_id(&value)
                    .unwrap_or_else(|| value.trim().trim_start_matches("arXiv:").to_string())
            }),
        abstract_text: frontmatter_line_scalar(block, "abstract"),
    }
}

fn markdown_metadata_confidence(values: &PaperMetadataValues) -> f64 {
    let mut confidence: f64 = 0.25;
    if values.title.is_some() {
        confidence += 0.35;
    }
    if !values.authors.is_empty() {
        confidence += 0.15;
    }
    if values.doi.is_some() || values.arxiv_id.is_some() {
        confidence += 0.2;
    }
    confidence.min(0.85)
}

fn frontmatter_metadata_confidence(values: &PaperMetadataValues) -> f64 {
    let mut confidence: f64 = 0.0;
    if values.title.is_some() {
        confidence += 0.38;
    }
    if !values.authors.is_empty() {
        confidence += 0.18;
    }
    if values.year.is_some() {
        confidence += 0.07;
    }
    if values.venue.is_some() || values.venue_short.is_some() || values.venue_type.is_some() {
        confidence += 0.07;
    }
    if values.doi.is_some() || values.arxiv_id.is_some() {
        confidence += 0.25;
    }
    if values.publication_date.is_some() || values.publication_stage.is_some() {
        confidence += 0.03;
    }
    confidence.min(0.96)
}

fn metadata_has_user_visible_values(values: &PaperMetadataValues) -> bool {
    values.title.is_some()
        || !values.authors.is_empty()
        || values.year.is_some()
        || values.venue.is_some()
        || values.venue_short.is_some()
        || values.venue_type.is_some()
        || values.publication_date.is_some()
        || values.publication_stage.is_some()
        || values.doi.is_some()
        || values.arxiv_id.is_some()
        || values.abstract_text.is_some()
}

fn frontmatter_yaml_block(content: &str) -> Option<&str> {
    let line_ending = if content.starts_with("---\r\n") {
        "\r\n"
    } else if content.starts_with("---\n") {
        "\n"
    } else {
        return None;
    };
    let after_open = &content[3 + line_ending.len()..];
    let close = after_open.find(&format!("{line_ending}---"))?;
    Some(&after_open[..close])
}

fn yaml_key(key: &str) -> serde_yaml::Value {
    serde_yaml::Value::String(key.to_string())
}

fn yaml_string(mapping: &serde_yaml::Mapping, key: &str) -> Option<String> {
    match mapping.get(yaml_key(key))? {
        serde_yaml::Value::String(value) => Some(clean_string(value)),
        serde_yaml::Value::Number(value) => Some(value.to_string()),
        serde_yaml::Value::Bool(value) => Some(value.to_string()),
        _ => None,
    }
    .filter(|value| !value.is_empty())
}

fn yaml_string_vec(mapping: &serde_yaml::Mapping, key: &str) -> Vec<String> {
    match mapping.get(yaml_key(key)) {
        Some(serde_yaml::Value::Sequence(items)) => items
            .iter()
            .filter_map(|item| match item {
                serde_yaml::Value::String(value) => Some(clean_string(value)),
                serde_yaml::Value::Number(value) => Some(value.to_string()),
                _ => None,
            })
            .filter(|value| !value.is_empty())
            .collect(),
        Some(serde_yaml::Value::String(value)) => split_authors(value),
        _ => Vec::new(),
    }
}

fn yaml_i32(mapping: &serde_yaml::Mapping, key: &str) -> Option<i32> {
    match mapping.get(yaml_key(key))? {
        serde_yaml::Value::Number(value) => {
            value.as_i64().and_then(|value| i32::try_from(value).ok())
        }
        serde_yaml::Value::String(value) => value.trim().parse::<i32>().ok(),
        _ => None,
    }
}

fn frontmatter_line_scalar(block: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}:");
    block.lines().find_map(|line| {
        let trimmed = line.trim();
        let value = trimmed.strip_prefix(&prefix)?.trim();
        (!value.is_empty() && !value.starts_with('['))
            .then(|| unquote_frontmatter_value(value))
            .filter(|value| !value.is_empty())
    })
}

fn frontmatter_line_list(block: &str, key: &str) -> Option<Vec<String>> {
    let mut lines = block.lines().peekable();
    let header = format!("{key}:");
    while let Some(line) = lines.next() {
        if line.trim() != header {
            continue;
        }
        let values = lines
            .map_while(|line| {
                let trimmed = line.trim();
                trimmed
                    .strip_prefix("- ")
                    .map(unquote_frontmatter_value)
                    .filter(|value| !value.is_empty())
            })
            .collect::<Vec<_>>();
        return Some(values);
    }
    None
}

fn unquote_frontmatter_value(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim()
        .to_string()
}

fn parse_venue_type(value: &str) -> Option<PaperVenueType> {
    match value.trim().to_ascii_lowercase().as_str() {
        "journal" => Some(PaperVenueType::Journal),
        "conference" => Some(PaperVenueType::Conference),
        "workshop" => Some(PaperVenueType::Workshop),
        "preprint" => Some(PaperVenueType::Preprint),
        "book" => Some(PaperVenueType::Book),
        "unknown" => Some(PaperVenueType::Unknown),
        _ => None,
    }
}

fn parse_publication_stage(value: &str) -> Option<PaperPublicationStage> {
    match value.trim().to_ascii_lowercase().as_str() {
        "preprint" => Some(PaperPublicationStage::Preprint),
        "published" => Some(PaperPublicationStage::Published),
        "accepted" => Some(PaperPublicationStage::Accepted),
        "unknown" => Some(PaperPublicationStage::Unknown),
        _ => None,
    }
}

fn strip_yaml_and_anchors(content: &str) -> String {
    let without_frontmatter = if let Some(rest) = content.strip_prefix("---") {
        rest.find("\n---")
            .map(|index| rest[index + 4..].to_string())
            .unwrap_or_else(|| content.to_string())
    } else {
        content.to_string()
    };
    Regex::new(r"(?s)<!--\s*tolaria:block.*?-->")
        .map(|regex| regex.replace_all(&without_frontmatter, "").to_string())
        .unwrap_or(without_frontmatter)
}

fn clean_markdown_line(line: &str) -> String {
    line.trim()
        .trim_start_matches('#')
        .trim()
        .trim_matches('*')
        .trim()
        .to_string()
}

fn first_title(lines: &[String]) -> Option<String> {
    lines
        .iter()
        .find(|line| {
            !line.eq_ignore_ascii_case("abstract")
                && line.len() >= 8
                && !line.contains('@')
                && !line.starts_with("doi:")
        })
        .cloned()
}

fn extract_authors(lines: &[String], title: Option<&str>) -> Vec<String> {
    let title_index = title.and_then(|title| lines.iter().position(|line| line == title));
    let Some(start) = title_index.map(|index| index + 1) else {
        return Vec::new();
    };
    let mut candidates = Vec::new();
    for line in lines.iter().skip(start).take(12) {
        if line.eq_ignore_ascii_case("abstract") || line.to_ascii_lowercase().starts_with("doi") {
            break;
        }
        if line.contains('@') || line.chars().any(|ch| ch.is_ascii_digit()) {
            continue;
        }
        if looks_like_author_line(line) {
            candidates.extend(split_authors(line));
        }
    }
    dedupe_strings(candidates)
}

fn looks_like_author_line(line: &str) -> bool {
    let words = line.split_whitespace().count();
    (2..=12).contains(&words) && line.chars().any(char::is_uppercase)
}

fn split_authors(value: &str) -> Vec<String> {
    value
        .split([',', ';'])
        .flat_map(|part| part.split(" and "))
        .map(clean_string)
        .filter(|part| part.split_whitespace().count() >= 2)
        .collect()
}

fn extract_abstract(lines: &[String]) -> Option<String> {
    let start = lines
        .iter()
        .position(|line| line.eq_ignore_ascii_case("abstract"))?;
    let mut parts = Vec::new();
    for line in lines.iter().skip(start + 1) {
        if line.starts_with(char::is_uppercase) && line.split_whitespace().count() <= 6 {
            break;
        }
        parts.push(line.clone());
        if parts.join(" ").len() > 1600 {
            break;
        }
    }
    let abstract_text = parts.join(" ");
    (!abstract_text.is_empty()).then_some(abstract_text)
}

fn extract_year(text: &str) -> Option<i32> {
    let current_year = Utc::now().year() + 1;
    Regex::new(r"\b(19[7-9][0-9]|20[0-9]{2})\b")
        .ok()?
        .captures_iter(text)
        .filter_map(|captures| captures.get(1)?.as_str().parse::<i32>().ok())
        .find(|year| (1970..=current_year).contains(year))
}

fn merge_metadata_sources(
    paper_id: &str,
    sources: Vec<PaperMetadataSource>,
    errors: Vec<PaperMetadataError>,
) -> PaperMetadata {
    let mut chosen = PaperMetadataValues::default();
    let mut confidence: f64 = 0.0;
    let mut candidates = Vec::new();

    for source in &sources {
        if source_is_trusted_for_merge(source) {
            chosen = merge_values(chosen, source.metadata.clone());
            confidence = confidence.max(source.confidence);
        } else if source.metadata.title.is_some() {
            candidates.push(PaperMetadataCandidate {
                id: format!("{}-{}", source.provider, candidates.len() + 1),
                provider: source.provider.clone(),
                confidence: source.confidence,
                reason: "Local title/author heuristic needs review".to_string(),
                metadata: source.metadata.clone(),
            });
            if !metadata_has_user_visible_values(&chosen) {
                chosen = merge_values(chosen, source.metadata.clone());
                confidence = confidence.max(source.confidence.min(0.7));
            }
        }
    }

    let status = if chosen.title.is_none() && chosen.doi.is_none() && chosen.arxiv_id.is_none() {
        if errors.is_empty() {
            PaperMetadataStatus::Missing
        } else {
            PaperMetadataStatus::Failed
        }
    } else if !candidates.is_empty() && confidence < 0.78 {
        PaperMetadataStatus::NeedsReview
    } else {
        PaperMetadataStatus::Ready
    };

    PaperMetadata {
        paper_id: paper_id.to_string(),
        status,
        confidence,
        updated_at: Some(Utc::now().to_rfc3339()),
        values: chosen,
        sources,
        candidates,
        errors,
    }
}

fn source_is_trusted_for_merge(source: &PaperMetadataSource) -> bool {
    if source.confidence >= 0.78 {
        return true;
    }
    source.matched_by != "title_search"
        && (source.metadata.doi.is_some() || source.metadata.arxiv_id.is_some())
}

fn merge_refresh_metadata_sources(
    paper_id: &str,
    sources: Vec<PaperMetadataSource>,
    errors: Vec<PaperMetadataError>,
) -> PaperMetadata {
    let protected_values = sources
        .iter()
        .filter(|source| source.provider == "paper_frontmatter")
        .fold(PaperMetadataValues::default(), |values, source| {
            merge_values(values, source.metadata.clone())
        });
    let protected_confidence = frontmatter_metadata_confidence(&protected_values);
    let mut metadata = merge_metadata_sources(paper_id, sources, errors);
    if metadata_has_user_visible_values(&protected_values) {
        metadata.values = merge_values(metadata.values, protected_values);
        metadata.confidence = metadata.confidence.max(protected_confidence);
        if metadata.status == PaperMetadataStatus::Missing
            || metadata.status == PaperMetadataStatus::Failed
        {
            metadata.status = PaperMetadataStatus::Ready;
        }
    }
    metadata
}

fn refresh_provider_query(
    fallback_query: &PaperMetadataValues,
    frontmatter_values: &PaperMetadataValues,
) -> PaperMetadataValues {
    if let Some(title) = frontmatter_values
        .title
        .as_ref()
        .filter(|title| !title.trim().is_empty())
    {
        return PaperMetadataValues {
            title: Some(title.clone()),
            authors: frontmatter_values.authors.clone(),
            year: frontmatter_values.year,
            ..PaperMetadataValues::default()
        };
    };
    fallback_query.clone()
}

fn merge_values(mut base: PaperMetadataValues, next: PaperMetadataValues) -> PaperMetadataValues {
    if next.title.is_some() {
        base.title = next.title;
    }
    if !next.authors.is_empty() {
        base.authors = next.authors;
    }
    base.year = next.year.or(base.year);
    base.venue = next.venue.or(base.venue);
    base.venue_short = next.venue_short.or(base.venue_short);
    base.venue_type = next.venue_type.or(base.venue_type);
    base.publication_date = next.publication_date.or(base.publication_date);
    base.publication_stage = next.publication_stage.or(base.publication_stage);
    base.doi = next.doi.or(base.doi);
    base.arxiv_id = next.arxiv_id.or(base.arxiv_id);
    base.abstract_text = next.abstract_text.or(base.abstract_text);
    base
}

fn normalize_doi(value: &str) -> String {
    value
        .trim()
        .trim_end_matches(['.', ',', ';'])
        .trim_start_matches("https://doi.org/")
        .trim_start_matches("http://doi.org/")
        .to_ascii_lowercase()
}

fn clean_string(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn dedupe_strings(values: Vec<String>) -> Vec<String> {
    values.into_iter().fold(Vec::new(), |mut acc, value| {
        if !acc.iter().any(|seen| seen.eq_ignore_ascii_case(&value)) {
            acc.push(value);
        }
        acc
    })
}

fn strip_htmlish(value: &str) -> String {
    Regex::new(r"<[^>]+>")
        .map(|regex| clean_string(&regex.replace_all(value, "")))
        .unwrap_or_else(|_| clean_string(value))
}

fn crossref_author_name(value: &Value) -> Option<String> {
    let given = value.get("given").and_then(Value::as_str).unwrap_or("");
    let family = value.get("family").and_then(Value::as_str).unwrap_or("");
    let name = clean_string(&format!("{given} {family}"));
    (!name.is_empty()).then_some(name)
}

fn openalex_author_name(value: &Value) -> Option<String> {
    value
        .get("author")
        .and_then(|author| author.get("display_name"))
        .and_then(Value::as_str)
        .map(clean_string)
}

fn openalex_venue_short(venue: Option<&str>) -> Option<String> {
    venue
        .is_some_and(|venue| venue.to_ascii_lowercase().contains("arxiv"))
        .then(|| "arXiv".to_string())
}

fn crossref_date(message: &Value) -> Option<String> {
    for key in ["published-print", "published-online", "issued"] {
        let Some(parts) = message
            .get(key)
            .and_then(|value| value.get("date-parts"))
            .and_then(Value::as_array)
            .and_then(|items| items.first())
            .and_then(Value::as_array)
        else {
            continue;
        };
        if let Some(date) = date_parts_to_string(parts) {
            return Some(date);
        }
    }
    None
}

fn date_parts_to_string(parts: &[Value]) -> Option<String> {
    let year = parts.first()?.as_i64()?;
    let month = parts.get(1).and_then(Value::as_i64).unwrap_or(1);
    let day = parts.get(2).and_then(Value::as_i64).unwrap_or(1);
    Some(format!("{year:04}-{month:02}-{day:02}"))
}

fn classify_crossref_type(value: &str) -> PaperVenueType {
    match value {
        "journal-article" => PaperVenueType::Journal,
        "proceedings-article" => PaperVenueType::Conference,
        "book-chapter" | "book" => PaperVenueType::Book,
        _ => PaperVenueType::Unknown,
    }
}

fn classify_openalex_source_type(value: &str) -> PaperVenueType {
    match value {
        "journal" => PaperVenueType::Journal,
        "conference" => PaperVenueType::Conference,
        "repository" => PaperVenueType::Preprint,
        "book" => PaperVenueType::Book,
        _ => PaperVenueType::Unknown,
    }
}

fn classify_openalex_work_type(value: &str) -> PaperVenueType {
    match value {
        "article" => PaperVenueType::Journal,
        "book" | "book-chapter" => PaperVenueType::Book,
        _ => PaperVenueType::Unknown,
    }
}

fn classify_openalex_publication_stage(
    source_type: Option<&str>,
    work_type: Option<&str>,
) -> PaperPublicationStage {
    if source_type == Some("repository") || work_type == Some("preprint") {
        PaperPublicationStage::Preprint
    } else {
        PaperPublicationStage::Published
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn extracts_doi_and_arxiv_ids() {
        assert_eq!(
            extract_doi("DOI: https://doi.org/10.1145/nnnn.1234567."),
            Some("10.1145/nnnn.1234567".to_string())
        );
        assert_eq!(
            extract_arxiv_id("Available as arXiv:2305.12345v2"),
            Some("2305.12345".to_string())
        );
    }

    #[test]
    fn extracts_local_markdown_metadata() {
        let metadata = extract_markdown_metadata(
            "# Kolmogorov-Arnold Network Autoencoders\n\
             Mohammadamin Moradi, Shirin Panahi and Erik Bollt\n\
             Abstract\n\
             This paper studies KAN autoencoders. DOI: 10.48550/arXiv.2401.01234\n",
        );

        assert_eq!(
            metadata.title.as_deref(),
            Some("Kolmogorov-Arnold Network Autoencoders")
        );
        assert!(metadata
            .authors
            .contains(&"Mohammadamin Moradi".to_string()));
        assert_eq!(metadata.doi.as_deref(), Some("10.48550/arxiv.2401.01234"));
    }

    #[test]
    fn normalizes_provider_responses() {
        let crossref = serde_json::json!({
            "message": {
                "title": ["Attention Is All You Need"],
                "author": [{"given": "Ashish", "family": "Vaswani"}],
                "DOI": "10.5555/3295222.3295349",
                "type": "proceedings-article",
                "container-title": ["NeurIPS"],
                "issued": {"date-parts": [[2017, 12, 4]]}
            }
        });
        let normalized = normalize_crossref_work(&crossref).unwrap();

        assert_eq!(
            normalized.title.as_deref(),
            Some("Attention Is All You Need")
        );
        assert_eq!(normalized.venue_type, Some(PaperVenueType::Conference));
        assert_eq!(normalized.publication_date.as_deref(), Some("2017-12-04"));
    }

    #[test]
    fn builds_openalex_requests_from_doi_or_title() {
        let doi_request = openalex_request_for_metadata(&PaperMetadataValues {
            title: Some("Attention Is All You Need".to_string()),
            doi: Some("https://doi.org/10.5555/3295222.3295349".to_string()),
            ..PaperMetadataValues::default()
        })
        .unwrap();

        assert_eq!(doi_request.matched_by, "doi");
        assert!(doi_request
            .url
            .contains("/works/doi:10.5555/3295222.3295349"));

        let title_request = openalex_request_for_metadata(&PaperMetadataValues {
            title: Some("Kolmogorov-Arnold Network Autoencoders".to_string()),
            ..PaperMetadataValues::default()
        })
        .unwrap();

        assert_eq!(title_request.matched_by, "title_search");
        assert!(title_request.url.contains("api.openalex.org/works"));
        assert!(title_request
            .url
            .contains("search.semantic=%22Kolmogorov-Arnold"));
        assert!(title_request.url.contains("per-page=3"));
    }

    #[test]
    fn normalizes_openalex_work_metadata() {
        let work = serde_json::json!({
            "id": "https://openalex.org/W123",
            "display_name": "Attention Is All You Need",
            "doi": "https://doi.org/10.5555/3295222.3295349",
            "publication_year": 2017,
            "publication_date": "2017-12-04",
            "type": "article",
            "primary_location": {
                "landing_page_url": "https://arxiv.org/abs/1706.03762",
                "source": {
                    "display_name": "Advances in Neural Information Processing Systems",
                    "type": "conference"
                }
            },
            "authorships": [
                {"author": {"display_name": "Ashish Vaswani"}},
                {"author": {"display_name": "Noam Shazeer"}}
            ],
            "abstract_inverted_index": {
                "Transformers": [0],
                "use": [1],
                "attention.": [2]
            }
        });
        let normalized = normalize_openalex_work(&work).unwrap();

        assert_eq!(
            normalized.title.as_deref(),
            Some("Attention Is All You Need")
        );
        assert_eq!(normalized.doi.as_deref(), Some("10.5555/3295222.3295349"));
        assert_eq!(normalized.year, Some(2017));
        assert_eq!(normalized.venue_type, Some(PaperVenueType::Conference));
        assert_eq!(normalized.arxiv_id.as_deref(), Some("1706.03762"));
        assert_eq!(
            normalized.abstract_text.as_deref(),
            Some("Transformers use attention.")
        );
    }

    #[test]
    fn reads_colon_title_from_frontmatter_for_refresh_query() {
        let content = "---\n\
            type: Paper\n\
            paper_id: fuximt\n\
            title: FuxiMT: Sparsifying Large Language Models for Chinese-Centric Multilingual Machine Translation\n\
            ---\n\
            # Wrong Parsed Title\n";
        let metadata = extract_frontmatter_metadata(content);
        let query = refresh_provider_query(&PaperMetadataValues::default(), &metadata);
        let request = openalex_request_for_metadata(&query).unwrap();

        assert_eq!(
            query.title.as_deref(),
            Some("FuxiMT: Sparsifying Large Language Models for Chinese-Centric Multilingual Machine Translation")
        );
        assert_eq!(request.matched_by, "title_search");
        assert!(request.url.contains("search.semantic=%22FuxiMT"));
    }

    #[test]
    fn normalizes_openalex_fuximt_work_metadata() {
        let work = serde_json::json!({
            "id": "https://openalex.org/W4417298641",
            "display_name": "FuxiMT: Sparsifying Large Language Models for Chinese-Centric Multilingual Machine Translation",
            "doi": "https://doi.org/10.48550/arxiv.2505.14256",
            "publication_year": 2025,
            "publication_date": "2025-05-20",
            "type": "preprint",
            "primary_location": {
                "landing_page_url": "http://arxiv.org/abs/2505.14256",
                "source": {
                    "display_name": "arXiv (Cornell University)",
                    "type": "repository"
                }
            },
            "authorships": [
                {"author": {"display_name": "Yong Yang"}},
                {"author": {"display_name": "Jiahao Guo"}}
            ],
            "ids": {
                "openalex": "https://openalex.org/W4417298641",
                "doi": "https://doi.org/10.48550/arxiv.2505.14256"
            }
        });
        let normalized = normalize_openalex_work(&work).unwrap();

        assert_eq!(
            normalized.title.as_deref(),
            Some("FuxiMT: Sparsifying Large Language Models for Chinese-Centric Multilingual Machine Translation")
        );
        assert_eq!(normalized.doi.as_deref(), Some("10.48550/arxiv.2505.14256"));
        assert_eq!(normalized.arxiv_id.as_deref(), Some("2505.14256"));
        assert_eq!(normalized.venue_short.as_deref(), Some("arXiv"));
        assert_eq!(normalized.venue_type, Some(PaperVenueType::Preprint));
        assert_eq!(
            normalized.publication_stage,
            Some(PaperPublicationStage::Preprint)
        );
    }

    #[test]
    fn fuximt_title_search_does_not_merge_lower_confidence_wrong_result() {
        let correct = normalize_openalex_work(&serde_json::json!({
            "id": "https://openalex.org/W4417298641",
            "display_name": "FuxiMT: Sparsifying Large Language Models for Chinese-Centric Multilingual Machine Translation",
            "doi": "https://doi.org/10.48550/arxiv.2505.14256",
            "publication_year": 2025,
            "publication_date": "2025-05-20",
            "type": "preprint",
            "primary_location": {
                "landing_page_url": "http://arxiv.org/abs/2505.14256",
                "source": {
                    "display_name": "arXiv (Cornell University)",
                    "type": "repository"
                }
            },
            "authorships": [
                {"author": {"display_name": "Yong Yang"}},
                {"author": {"display_name": "Jiahao Guo"}}
            ],
            "ids": {
                "openalex": "https://openalex.org/W4417298641",
                "doi": "https://doi.org/10.48550/arxiv.2505.14256"
            }
        }))
        .unwrap();
        let wrong = normalize_openalex_work(&serde_json::json!({
            "id": "https://openalex.org/W7131290187",
            "display_name": "Prompt-induced cultural mediation and its limits: a micro-level analysis of LLM translation of Chinese tourism texts",
            "doi": "https://doi.org/10.1080/23311983.2026.2631304",
            "publication_year": 2026,
            "publication_date": "2026-02-23",
            "type": "article",
            "primary_location": {
                "source": {
                    "display_name": "Cogent Arts and Humanities",
                    "type": "journal"
                }
            },
            "authorships": [
                {"author": {"display_name": "Shiyue Chen"}},
                {"author": {"display_name": "Tianli Zhou"}}
            ]
        }))
        .unwrap();

        let metadata = merge_metadata_sources(
            "fuximt",
            vec![
                PaperMetadataSource {
                    provider: "openalex".to_string(),
                    identifier: Some("https://openalex.org/W4417298641".to_string()),
                    confidence: 0.9,
                    matched_by: "title_search".to_string(),
                    metadata: correct,
                },
                PaperMetadataSource {
                    provider: "openalex".to_string(),
                    identifier: Some("https://openalex.org/W7131290187".to_string()),
                    confidence: 0.72,
                    matched_by: "title_search".to_string(),
                    metadata: wrong,
                },
            ],
            vec![],
        );

        assert_eq!(
            metadata.values.title.as_deref(),
            Some("FuxiMT: Sparsifying Large Language Models for Chinese-Centric Multilingual Machine Translation")
        );
        assert_eq!(
            metadata.values.doi.as_deref(),
            Some("10.48550/arxiv.2505.14256")
        );
        assert_eq!(metadata.values.year, Some(2025));
        assert_eq!(metadata.values.venue_short.as_deref(), Some("arXiv"));
        assert_eq!(metadata.candidates.len(), 1);
        assert_eq!(
            metadata.candidates[0].metadata.title.as_deref(),
            Some("Prompt-induced cultural mediation and its limits: a micro-level analysis of LLM translation of Chinese tourism texts")
        );
    }

    #[test]
    fn converts_openalex_title_search_results_to_reviewable_sources() {
        let request = OpenAlexMetadataRequest {
            url: openalex_title_search_url("A Fuzzy Local Title"),
            matched_by: "title_search".to_string(),
            query_title: Some("A Fuzzy Local Title".to_string()),
        };
        let response = serde_json::json!({
            "results": [{
                "id": "https://openalex.org/W999",
                "display_name": "A Different Remote Title",
                "publication_year": 2025,
                "primary_location": {
                    "source": {
                        "display_name": "arXiv",
                        "type": "repository"
                    }
                },
                "authorships": [{"author": {"display_name": "Alice Example"}}]
            }]
        });
        let sources = openalex_sources_from_response(&request, &response);

        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].provider, "openalex");
        assert_eq!(sources[0].matched_by, "title_search");
        assert!(sources[0].confidence < 0.78);
        assert_eq!(
            sources[0].metadata.venue_type,
            Some(PaperVenueType::Preprint)
        );
    }

    #[test]
    fn writes_metadata_sidecar_and_updates_frontmatter() {
        let dir = TempDir::new().unwrap();
        let paper_path = dir.path().join("paper.md");
        let pdf_path = dir.path().join("source.pdf");
        let metadata_path = dir.path().join("metadata.json");
        fs::write(
            &paper_path,
            "---\ntype: Paper\npaper_id: kan\nsource_pdf: source.pdf\n---\n# KAN Autoencoders\nAlice Example, Bob Example\nAbstract\nA study. DOI: 10.1234/kan.2026\n",
        )
        .unwrap();
        fs::write(
            &pdf_path,
            b"%PDF-1.7 /Title(KAN Autoencoders) /Author(Alice Example; Bob Example)",
        )
        .unwrap();

        let metadata =
            extract_paper_metadata_file("kan", &paper_path, &pdf_path, &metadata_path).unwrap();

        assert!(metadata_path.exists());
        assert_eq!(metadata.values.title.as_deref(), Some("KAN Autoencoders"));
        let paper = fs::read_to_string(&paper_path).unwrap();
        assert!(paper.contains("metadata_status: ready"));
        assert!(paper.contains("doi: 10.1234/kan.2026"));
        assert!(paper.contains("metadata_confidence:"));
        assert!(paper.contains("authors:"));
    }

    #[test]
    fn saves_manual_metadata_and_clears_review_state() {
        let dir = TempDir::new().unwrap();
        let paper_path = dir.path().join("paper.md");
        let metadata_path = dir.path().join("metadata.json");
        fs::write(
            &paper_path,
            "---\ntype: Paper\npaper_id: kan\nsource_pdf: source.pdf\n---\n# Draft Title\n",
        )
        .unwrap();
        let review_metadata = merge_metadata_sources(
            "kan",
            vec![PaperMetadataSource {
                provider: "parsed_markdown".to_string(),
                identifier: None,
                confidence: 0.65,
                matched_by: "paper_md_heuristic".to_string(),
                metadata: PaperMetadataValues {
                    title: Some("Draft Title".to_string()),
                    ..PaperMetadataValues::default()
                },
            }],
            vec![],
        );
        write_paper_metadata_file(&metadata_path, &review_metadata).unwrap();

        let metadata = save_paper_metadata_file(
            "kan",
            &paper_path,
            &metadata_path,
            PaperMetadataValues {
                title: Some("Corrected Title".to_string()),
                authors: vec!["Alice Example".to_string()],
                venue: Some("NeurIPS".to_string()),
                ..PaperMetadataValues::default()
            },
        )
        .unwrap();

        assert_eq!(metadata.status, PaperMetadataStatus::Ready);
        assert!(metadata.candidates.is_empty());
        assert_eq!(metadata.confidence, 1.0);
        let paper = fs::read_to_string(&paper_path).unwrap();
        assert!(paper.contains("title: Corrected Title"));
        assert!(paper.contains("metadata_status: ready"));
        assert!(paper.contains("venue: NeurIPS"));
    }

    #[test]
    fn refresh_uses_current_frontmatter_before_pdf_or_body_metadata() {
        let dir = TempDir::new().unwrap();
        let paper_path = dir.path().join("paper.md");
        let pdf_path = dir.path().join("source.pdf");
        let metadata_path = dir.path().join("metadata.json");
        fs::write(
            &paper_path,
            "---\n\
             type: Paper\n\
             paper_id: kan\n\
             source_pdf: source.pdf\n\
             title: Corrected KAN Paper\n\
             doi: 10.9999/corrected\n\
             authors:\n\
               - Correct Author\n\
             ---\n\
             # Old Parsed Title\n\
             Abstract\n\
             Body still mentions DOI: 10.1111/stale\n",
        )
        .unwrap();
        fs::write(
            &pdf_path,
            b"%PDF-1.7 /Title(Old PDF Title) /Author(Stale Author) DOI 10.2222/stale",
        )
        .unwrap();

        let metadata =
            refresh_paper_metadata_file("kan", &paper_path, &pdf_path, &metadata_path).unwrap();

        assert_eq!(
            metadata.values.title.as_deref(),
            Some("Corrected KAN Paper")
        );
        assert_eq!(metadata.values.doi.as_deref(), Some("10.9999/corrected"));
        assert_eq!(metadata.values.authors, vec!["Correct Author".to_string()]);
        assert!(metadata.sources.iter().any(|source| {
            source.provider == "paper_frontmatter"
                && source.matched_by == "user_visible_properties"
                && source.metadata.doi.as_deref() == Some("10.9999/corrected")
        }));
    }

    #[test]
    fn refresh_title_query_uses_saved_frontmatter_title_directly() {
        let fallback = PaperMetadataValues {
            title: Some("Wrong PDF Title".to_string()),
            doi: Some("10.1111/stale".to_string()),
            ..PaperMetadataValues::default()
        };
        let frontmatter = PaperMetadataValues {
            title: Some("Corrected Paper Title".to_string()),
            doi: Some("10.1111/stale".to_string()),
            ..PaperMetadataValues::default()
        };

        let query = refresh_provider_query(&fallback, &frontmatter);
        let request = openalex_request_for_metadata(&query).unwrap();

        assert_eq!(query.title.as_deref(), Some("Corrected Paper Title"));
        assert_eq!(query.doi, None);
        assert_eq!(request.matched_by, "title_search");
        assert!(request.url.contains("search.semantic=%22Corrected"));
    }

    #[test]
    fn refresh_merge_preserves_user_frontmatter_over_provider_metadata() {
        let metadata = merge_refresh_metadata_sources(
            "kan",
            vec![
                PaperMetadataSource {
                    provider: "paper_frontmatter".to_string(),
                    identifier: None,
                    confidence: 0.8,
                    matched_by: "user_visible_properties".to_string(),
                    metadata: PaperMetadataValues {
                        title: Some("Corrected KAN Paper".to_string()),
                        authors: vec!["Correct Author".to_string()],
                        ..PaperMetadataValues::default()
                    },
                },
                PaperMetadataSource {
                    provider: "openalex".to_string(),
                    identifier: Some("https://openalex.org/Wrong".to_string()),
                    confidence: 0.98,
                    matched_by: "doi".to_string(),
                    metadata: PaperMetadataValues {
                        title: Some("Wrong OpenAlex Title".to_string()),
                        authors: vec!["Wrong Author".to_string()],
                        venue: Some("Wrong Venue".to_string()),
                        year: Some(2024),
                        ..PaperMetadataValues::default()
                    },
                },
            ],
            vec![],
        );

        assert_eq!(
            metadata.values.title.as_deref(),
            Some("Corrected KAN Paper")
        );
        assert_eq!(metadata.values.authors, vec!["Correct Author".to_string()]);
        assert_eq!(metadata.values.venue.as_deref(), Some("Wrong Venue"));
        assert_eq!(metadata.values.year, Some(2024));
    }

    #[test]
    fn low_confidence_title_match_requires_review() {
        let metadata = merge_metadata_sources(
            "paper",
            vec![PaperMetadataSource {
                provider: "parsed_markdown".to_string(),
                identifier: None,
                confidence: 0.65,
                matched_by: "paper_md_heuristic".to_string(),
                metadata: PaperMetadataValues {
                    title: Some("A Fuzzy Title".to_string()),
                    ..PaperMetadataValues::default()
                },
            }],
            vec![],
        );

        assert_eq!(metadata.status, PaperMetadataStatus::NeedsReview);
        assert_eq!(metadata.candidates.len(), 1);
    }
}
