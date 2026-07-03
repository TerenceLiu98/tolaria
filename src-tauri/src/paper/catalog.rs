use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use crate::vault::{scan_vault, VaultEntry};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaperCatalogSourcePdfState {
    Missing,
    Present,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaperCatalogDuplicateState {
    None,
    Candidate,
    Dismissed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaperCatalogDuplicateMatch {
    Doi,
    Arxiv,
    Openalex,
    SemanticScholar,
    TitleYear,
    TitleAuthor,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperCatalogDuplicateCandidate {
    pub paper_id: String,
    pub path: String,
    pub title: String,
    #[serde(rename = "match")]
    pub match_kind: PaperCatalogDuplicateMatch,
    pub reason: String,
    pub decision_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperCatalogEntry {
    pub paper_id: String,
    pub path: String,
    pub paper_path: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub venue_short: Option<String>,
    pub venue_type: Option<String>,
    pub publication_stage: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub openalex_id: Option<String>,
    pub semantic_scholar_id: Option<String>,
    pub parse_status: Option<String>,
    pub metadata_status: Option<String>,
    pub metadata_confidence: Option<f64>,
    pub source_pdf_state: PaperCatalogSourcePdfState,
    pub duplicate_state: PaperCatalogDuplicateState,
    pub duplicate_candidates: Vec<PaperCatalogDuplicateCandidate>,
    pub workspace_id: Option<String>,
    pub abstract_text: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaperCatalogDecisions {
    dismissed_duplicate_decision_ids: Vec<String>,
}

pub fn normalize_doi(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() {
        return None;
    }
    let lower = trimmed.to_lowercase();
    let without_url = lower
        .strip_prefix("https://doi.org/")
        .or_else(|| lower.strip_prefix("http://doi.org/"))
        .or_else(|| lower.strip_prefix("https://dx.doi.org/"))
        .or_else(|| lower.strip_prefix("http://dx.doi.org/"))
        .unwrap_or(&lower);
    Some(
        without_url
            .strip_prefix("doi:")
            .unwrap_or(without_url)
            .trim()
            .to_string(),
    )
    .filter(|value| !value.is_empty())
}

pub fn normalize_arxiv_id(value: Option<&str>, strip_version: bool) -> Option<String> {
    let trimmed = value?.trim().to_lowercase();
    if trimmed.is_empty() {
        return None;
    }
    let without_prefix = trimmed
        .strip_prefix("arxiv:")
        .unwrap_or(&trimmed)
        .trim()
        .trim_start_matches("https://arxiv.org/abs/")
        .trim_start_matches("http://arxiv.org/abs/")
        .trim_start_matches("https://arxiv.org/pdf/")
        .trim_start_matches("http://arxiv.org/pdf/");
    let value = without_prefix.trim_end_matches(".pdf");
    if !strip_version {
        return Some(value.to_string()).filter(|value| !value.is_empty());
    }
    Some(
        regex::Regex::new(r"v\d+$")
            .ok()?
            .replace(value, "")
            .to_string(),
    )
    .filter(|value| !value.is_empty())
}

pub fn title_fingerprint(value: Option<&str>) -> Option<String> {
    let normalized = value?
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    (normalized.len() >= 8).then_some(normalized)
}

pub fn first_author_fingerprint(authors: &[String]) -> Option<String> {
    authors
        .first()?
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .last()
        .map(str::to_string)
}

pub fn list_paper_catalog_file(vault_path: &Path) -> Result<Vec<PaperCatalogEntry>, String> {
    let decisions = read_catalog_decisions(vault_path);
    let entries = scan_vault(vault_path, &HashMap::new())?
        .into_iter()
        .filter_map(|entry| catalog_entry_from_vault_entry(vault_path, entry))
        .collect::<Vec<_>>();
    Ok(with_duplicate_candidates(
        entries,
        decisions
            .dismissed_duplicate_decision_ids
            .iter()
            .cloned()
            .collect(),
    ))
}

pub fn search_paper_catalog_file(
    vault_path: &Path,
    query: &str,
) -> Result<Vec<PaperCatalogEntry>, String> {
    let query = query.trim().to_lowercase();
    let entries = list_paper_catalog_file(vault_path)?;
    if query.is_empty() {
        return Ok(entries);
    }
    Ok(entries
        .into_iter()
        .filter(|entry| catalog_search_haystack(entry).contains(&query))
        .collect())
}

pub fn find_paper_duplicates_file(vault_path: &Path) -> Result<Vec<PaperCatalogEntry>, String> {
    Ok(list_paper_catalog_file(vault_path)?
        .into_iter()
        .filter(|entry| entry.duplicate_state == PaperCatalogDuplicateState::Candidate)
        .collect())
}

pub fn mark_paper_duplicate_decision_file(
    vault_path: &Path,
    decision_id: &str,
    dismissed: bool,
) -> Result<Vec<PaperCatalogEntry>, String> {
    let mut decisions = read_catalog_decisions(vault_path);
    let mut ids = decisions
        .dismissed_duplicate_decision_ids
        .into_iter()
        .collect::<HashSet<_>>();
    if dismissed {
        ids.insert(decision_id.to_string());
    } else {
        ids.remove(decision_id);
    }
    decisions.dismissed_duplicate_decision_ids = ids.into_iter().collect();
    decisions.dismissed_duplicate_decision_ids.sort();
    write_catalog_decisions(vault_path, &decisions)?;
    list_paper_catalog_file(vault_path)
}

fn catalog_entry_from_vault_entry(
    vault_path: &Path,
    entry: VaultEntry,
) -> Option<PaperCatalogEntry> {
    if entry.is_a.as_deref() != Some("Paper") {
        return None;
    }
    let paper_id = property_string(&entry.properties, "paper_id")
        .or_else(|| paper_id_from_path(&entry.path))
        .unwrap_or_else(|| entry.title.clone());
    let metadata_path = Path::new(&entry.path)
        .parent()
        .map(|parent| parent.join("metadata.json"));
    let sidecar = metadata_path
        .as_deref()
        .and_then(read_metadata_sidecar_values);
    let source_pdf_state = source_pdf_state(vault_path, &entry);

    Some(PaperCatalogEntry {
        paper_id,
        path: entry.path.clone(),
        paper_path: entry.path.clone(),
        title: property_string(&entry.properties, "title").unwrap_or(entry.title),
        authors: property_string_array(&entry.properties, "authors"),
        year: property_i32(&entry.properties, "year"),
        venue: property_string(&entry.properties, "venue"),
        venue_short: property_string(&entry.properties, "venue_short"),
        venue_type: property_string(&entry.properties, "venue_type"),
        publication_stage: property_string(&entry.properties, "publication_stage"),
        doi: property_string(&entry.properties, "doi"),
        arxiv_id: property_string(&entry.properties, "arxiv_id"),
        openalex_id: property_string(&entry.properties, "openalex_id").or_else(|| {
            sidecar
                .as_ref()
                .and_then(|values| values.openalex_id.clone())
        }),
        semantic_scholar_id: property_string(&entry.properties, "semantic_scholar_id").or_else(
            || {
                sidecar
                    .as_ref()
                    .and_then(|values| values.semantic_scholar_id.clone())
            },
        ),
        parse_status: property_string(&entry.properties, "parse_status"),
        metadata_status: property_string(&entry.properties, "metadata_status"),
        metadata_confidence: property_f64(&entry.properties, "metadata_confidence"),
        source_pdf_state,
        duplicate_state: PaperCatalogDuplicateState::None,
        duplicate_candidates: vec![],
        workspace_id: None,
        abstract_text: property_string(&entry.properties, "abstract").or_else(|| {
            sidecar
                .as_ref()
                .and_then(|values| values.abstract_text.clone())
        }),
    })
}

#[derive(Default)]
struct MetadataSidecarValues {
    openalex_id: Option<String>,
    semantic_scholar_id: Option<String>,
    abstract_text: Option<String>,
}

fn read_metadata_sidecar_values(path: &Path) -> Option<MetadataSidecarValues> {
    let value = serde_json::from_str::<Value>(&fs::read_to_string(path).ok()?).ok()?;
    let sources = value.get("sources")?.as_array()?;
    let mut result = MetadataSidecarValues {
        abstract_text: value
            .get("abstract")
            .and_then(Value::as_str)
            .map(str::to_string),
        ..MetadataSidecarValues::default()
    };
    for source in sources {
        let provider = source
            .get("provider")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let identifier = source
            .get("identifier")
            .and_then(Value::as_str)
            .map(str::to_string);
        match provider {
            "openalex" => result.openalex_id = result.openalex_id.or(identifier),
            "semantic_scholar" => {
                result.semantic_scholar_id = result.semantic_scholar_id.or(identifier)
            }
            _ => {}
        }
    }
    Some(result)
}

fn with_duplicate_candidates(
    entries: Vec<PaperCatalogEntry>,
    dismissed: HashSet<String>,
) -> Vec<PaperCatalogEntry> {
    let mut next = entries;
    for left_index in 0..next.len() {
        for right_index in (left_index + 1)..next.len() {
            let Some((match_kind, reason)) = duplicate_match(&next[left_index], &next[right_index])
            else {
                continue;
            };
            let decision_id = duplicate_decision_id(&next[left_index], &next[right_index]);
            if dismissed.contains(&decision_id) {
                if next[left_index].duplicate_state != PaperCatalogDuplicateState::Candidate {
                    next[left_index].duplicate_state = PaperCatalogDuplicateState::Dismissed;
                }
                if next[right_index].duplicate_state != PaperCatalogDuplicateState::Candidate {
                    next[right_index].duplicate_state = PaperCatalogDuplicateState::Dismissed;
                }
                continue;
            }
            let left_candidate = duplicate_candidate(
                &next[left_index],
                &next[right_index],
                match_kind.clone(),
                &reason,
                &decision_id,
            );
            let right_candidate = duplicate_candidate(
                &next[right_index],
                &next[left_index],
                match_kind,
                &reason,
                &decision_id,
            );
            next[left_index].duplicate_candidates.push(left_candidate);
            next[right_index].duplicate_candidates.push(right_candidate);
            next[left_index].duplicate_state = PaperCatalogDuplicateState::Candidate;
            next[right_index].duplicate_state = PaperCatalogDuplicateState::Candidate;
        }
    }
    next
}

fn duplicate_match(
    left: &PaperCatalogEntry,
    right: &PaperCatalogEntry,
) -> Option<(PaperCatalogDuplicateMatch, String)> {
    if let (Some(left_doi), Some(right_doi)) = (
        normalize_doi(left.doi.as_deref()),
        normalize_doi(right.doi.as_deref()),
    ) {
        if left_doi == right_doi {
            return Some((PaperCatalogDuplicateMatch::Doi, "same DOI".to_string()));
        }
    }
    if let (Some(left_arxiv), Some(right_arxiv)) = (
        normalize_arxiv_id(left.arxiv_id.as_deref(), true),
        normalize_arxiv_id(right.arxiv_id.as_deref(), true),
    ) {
        if left_arxiv == right_arxiv {
            return Some((
                PaperCatalogDuplicateMatch::Arxiv,
                "same arXiv ID".to_string(),
            ));
        }
    }
    if normalized_eq(left.openalex_id.as_deref(), right.openalex_id.as_deref()) {
        return Some((
            PaperCatalogDuplicateMatch::Openalex,
            "same OpenAlex ID".to_string(),
        ));
    }
    if normalized_eq(
        left.semantic_scholar_id.as_deref(),
        right.semantic_scholar_id.as_deref(),
    ) {
        return Some((
            PaperCatalogDuplicateMatch::SemanticScholar,
            "same Semantic Scholar ID".to_string(),
        ));
    }
    if title_fingerprint(Some(&left.title))? != title_fingerprint(Some(&right.title))? {
        return None;
    }
    if left.year.is_some() && left.year == right.year {
        return Some((
            PaperCatalogDuplicateMatch::TitleYear,
            "same title and year".to_string(),
        ));
    }
    if first_author_fingerprint(&left.authors)? == first_author_fingerprint(&right.authors)? {
        return Some((
            PaperCatalogDuplicateMatch::TitleAuthor,
            "same title and first author".to_string(),
        ));
    }
    None
}

fn duplicate_decision_id(left: &PaperCatalogEntry, right: &PaperCatalogEntry) -> String {
    let mut ids = [left.paper_id.as_str(), right.paper_id.as_str()];
    ids.sort_unstable();
    ids.join("::")
}

fn duplicate_candidate(
    source: &PaperCatalogEntry,
    duplicate: &PaperCatalogEntry,
    match_kind: PaperCatalogDuplicateMatch,
    reason: &str,
    decision_id: &str,
) -> PaperCatalogDuplicateCandidate {
    let _ = source;
    PaperCatalogDuplicateCandidate {
        paper_id: duplicate.paper_id.clone(),
        path: duplicate.path.clone(),
        title: duplicate.title.clone(),
        match_kind,
        reason: reason.to_string(),
        decision_id: decision_id.to_string(),
    }
}

fn normalized_eq(left: Option<&str>, right: Option<&str>) -> bool {
    match (left, right) {
        (Some(left), Some(right)) => left.trim().eq_ignore_ascii_case(right.trim()),
        _ => false,
    }
}

fn property_string(properties: &HashMap<String, Value>, key: &str) -> Option<String> {
    match properties.get(key)? {
        Value::String(value) => Some(value.trim().to_string()).filter(|value| !value.is_empty()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn property_string_array(properties: &HashMap<String, Value>, key: &str) -> Vec<String> {
    match properties.get(key) {
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect(),
        Some(Value::String(value)) => value
            .split(['\n', ';'])
            .flat_map(|part| part.split(" and "))
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect(),
        _ => vec![],
    }
}

fn property_i32(properties: &HashMap<String, Value>, key: &str) -> Option<i32> {
    match properties.get(key)? {
        Value::Number(value) => value.as_i64().and_then(|value| i32::try_from(value).ok()),
        Value::String(value) => value.trim().parse().ok(),
        _ => None,
    }
}

fn property_f64(properties: &HashMap<String, Value>, key: &str) -> Option<f64> {
    match properties.get(key)? {
        Value::Number(value) => value.as_f64(),
        Value::String(value) => value.trim().parse().ok(),
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

fn source_pdf_state(vault_path: &Path, entry: &VaultEntry) -> PaperCatalogSourcePdfState {
    let Some(source_pdf) = property_string(&entry.properties, "source_pdf") else {
        return PaperCatalogSourcePdfState::Unknown;
    };
    let paper_path = Path::new(&entry.path);
    let source_path = paper_path.parent().unwrap_or(vault_path).join(source_pdf);
    if source_path.exists() {
        PaperCatalogSourcePdfState::Present
    } else {
        PaperCatalogSourcePdfState::Missing
    }
}

fn catalog_search_haystack(entry: &PaperCatalogEntry) -> String {
    [
        Some(entry.title.as_str()),
        entry.abstract_text.as_deref(),
        entry.venue.as_deref(),
        entry.venue_short.as_deref(),
        entry.venue_type.as_deref(),
        entry.doi.as_deref(),
        entry.arxiv_id.as_deref(),
        entry.openalex_id.as_deref(),
        entry.semantic_scholar_id.as_deref(),
    ]
    .into_iter()
    .flatten()
    .chain(entry.authors.iter().map(String::as_str))
    .collect::<Vec<_>>()
    .join(" ")
    .to_lowercase()
}

fn decisions_path(vault_path: &Path) -> PathBuf {
    vault_path.join("papers").join("catalog-decisions.json")
}

fn read_catalog_decisions(vault_path: &Path) -> PaperCatalogDecisions {
    fs::read_to_string(decisions_path(vault_path))
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_catalog_decisions(
    vault_path: &Path,
    decisions: &PaperCatalogDecisions,
) -> Result<(), String> {
    let path = decisions_path(vault_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }
    let content = serde_json::to_string_pretty(decisions)
        .map_err(|error| format!("Failed to serialize catalog decisions: {error}"))?;
    fs::write(&path, content)
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_paper(vault: &Path, slug: &str, frontmatter: &str) -> PathBuf {
        let dir = vault.join("papers").join(slug);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("source.pdf"), b"%PDF-1.7").unwrap();
        let paper = dir.join("paper.md");
        fs::write(
            &paper,
            format!("---\ntype: Paper\npaper_id: {slug}\nsource_pdf: source.pdf\n{frontmatter}---\n# Paper\n"),
        )
        .unwrap();
        paper
    }

    #[test]
    fn normalizes_catalog_identifiers() {
        assert_eq!(
            normalize_doi(Some("https://doi.org/10.1145/ABC.DEF")).as_deref(),
            Some("10.1145/abc.def")
        );
        assert_eq!(
            normalize_arxiv_id(Some("https://arxiv.org/pdf/2305.12345v2"), true).as_deref(),
            Some("2305.12345")
        );
        assert_eq!(
            title_fingerprint(Some("Kolmogorov-Arnold Network Autoencoders!")).as_deref(),
            Some("kolmogorov arnold network autoencoders")
        );
        assert_eq!(
            first_author_fingerprint(&["Ashish Vaswani".to_string()]).as_deref(),
            Some("vaswani")
        );
    }

    #[test]
    fn loads_catalog_entries_from_paper_frontmatter() {
        let dir = TempDir::new().unwrap();
        write_paper(
            dir.path(),
            "attention",
            "title: Attention Is All You Need\nauthors:\n  - Ashish Vaswani\n  - Noam Shazeer\nyear: 2017\nvenue_short: NeurIPS\nparse_status: parsed\nmetadata_status: ready\nmetadata_confidence: 0.98\n",
        );

        let catalog = list_paper_catalog_file(dir.path()).unwrap();

        assert_eq!(catalog.len(), 1);
        assert_eq!(catalog[0].paper_id, "attention");
        assert_eq!(catalog[0].authors, vec!["Ashish Vaswani", "Noam Shazeer"]);
        assert_eq!(catalog[0].year, Some(2017));
        assert_eq!(
            catalog[0].source_pdf_state,
            PaperCatalogSourcePdfState::Present
        );
    }

    #[test]
    fn detects_and_dismisses_duplicate_candidates() {
        let dir = TempDir::new().unwrap();
        write_paper(dir.path(), "one", "doi: 10.1000/example\n");
        write_paper(dir.path(), "two", "doi: https://doi.org/10.1000/EXAMPLE\n");

        let catalog = list_paper_catalog_file(dir.path()).unwrap();
        let one = catalog
            .iter()
            .find(|entry| entry.paper_id == "one")
            .unwrap();
        assert_eq!(
            one.duplicate_candidates[0].match_kind,
            PaperCatalogDuplicateMatch::Doi
        );
        let decision_id = one.duplicate_candidates[0].decision_id.clone();

        let dismissed = mark_paper_duplicate_decision_file(dir.path(), &decision_id, true).unwrap();
        let one = dismissed
            .iter()
            .find(|entry| entry.paper_id == "one")
            .unwrap();
        assert_eq!(one.duplicate_state, PaperCatalogDuplicateState::Dismissed);
        assert!(one.duplicate_candidates.is_empty());
    }

    #[test]
    fn searches_catalog_metadata() {
        let dir = TempDir::new().unwrap();
        write_paper(
            dir.path(),
            "one",
            "title: Paper One\nauthors:\n  - Alice Example\nvenue: TestConf\n",
        );
        write_paper(
            dir.path(),
            "two",
            "title: Paper Two\nauthors:\n  - Bob Example\nvenue: Journal\n",
        );

        let results = search_paper_catalog_file(dir.path(), "testconf").unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].paper_id, "one");
    }
}
