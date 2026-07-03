use serde::Serialize;
use std::path::{Path, PathBuf};

pub const PAPERS_DIR: &str = "papers";
pub const PAPER_NOTE_FILENAME: &str = "paper.md";
pub const SOURCE_PDF_FILENAME: &str = "source.pdf";
pub const BLOCKS_FILENAME: &str = "blocks.jsonl";
pub const ANNOTATIONS_FILENAME: &str = "annotations.jsonl";
pub const METADATA_FILENAME: &str = "metadata.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperBundlePaths {
    pub paper_dir: PathBuf,
    pub paper_note: PathBuf,
    pub source_pdf: PathBuf,
    pub blocks: PathBuf,
    pub annotations: PathBuf,
    pub metadata: PathBuf,
}

pub fn normalize_paper_slug(input: &str) -> String {
    let mut slug = String::new();
    let mut previous_was_separator = true;

    for ch in input.trim().chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            previous_was_separator = false;
        } else if !previous_was_separator {
            slug.push('-');
            previous_was_separator = true;
        }
    }

    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        "paper".to_string()
    } else {
        slug.to_string()
    }
}

pub fn is_pdf_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
}

pub fn paper_title_from_source_path(source_path: &Path) -> String {
    let stem = source_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Paper");
    let words = stem
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>();

    if words.is_empty() {
        "Paper".to_string()
    } else {
        words.join(" ")
    }
}

pub fn paper_bundle_paths(vault_path: &Path, paper_slug: &str) -> PaperBundlePaths {
    let paper_dir = vault_path.join(PAPERS_DIR).join(paper_slug);
    PaperBundlePaths {
        paper_note: paper_dir.join(PAPER_NOTE_FILENAME),
        source_pdf: paper_dir.join(SOURCE_PDF_FILENAME),
        blocks: paper_dir.join(BLOCKS_FILENAME),
        annotations: paper_dir.join(ANNOTATIONS_FILENAME),
        metadata: paper_dir.join(METADATA_FILENAME),
        paper_dir,
    }
}

pub fn unique_paper_slug(vault_path: &Path, base_slug: &str) -> String {
    let normalized = normalize_paper_slug(base_slug);
    if !paper_bundle_paths(vault_path, &normalized)
        .paper_dir
        .exists()
    {
        return normalized;
    }

    for suffix in 2.. {
        let candidate = format!("{normalized}-{suffix}");
        if !paper_bundle_paths(vault_path, &candidate)
            .paper_dir
            .exists()
        {
            return candidate;
        }
    }

    unreachable!("unbounded suffix search should always find a paper slug")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn normalizes_paper_slugs_for_portable_paths() {
        assert_eq!(
            normalize_paper_slug("Attention Is All You Need.pdf"),
            "attention-is-all-you-need-pdf"
        );
        assert_eq!(
            normalize_paper_slug("  Long_Context: Notes 2026  "),
            "long-context-notes-2026"
        );
        assert_eq!(normalize_paper_slug("!!!"), "paper");
    }

    #[test]
    fn builds_canonical_bundle_paths() {
        let vault = Path::new("/vault");
        let paths = paper_bundle_paths(vault, "vaswani-2017-attention");

        assert_eq!(
            paths.paper_dir,
            PathBuf::from("/vault/papers/vaswani-2017-attention")
        );
        assert_eq!(
            paths.paper_note,
            PathBuf::from("/vault/papers/vaswani-2017-attention/paper.md")
        );
        assert_eq!(
            paths.source_pdf,
            PathBuf::from("/vault/papers/vaswani-2017-attention/source.pdf")
        );
        assert_eq!(
            paths.blocks,
            PathBuf::from("/vault/papers/vaswani-2017-attention/blocks.jsonl")
        );
        assert_eq!(
            paths.annotations,
            PathBuf::from("/vault/papers/vaswani-2017-attention/annotations.jsonl")
        );
        assert_eq!(
            paths.metadata,
            PathBuf::from("/vault/papers/vaswani-2017-attention/metadata.json")
        );
    }

    #[test]
    fn picks_unique_slug_when_paper_folder_exists() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir_all(dir.path().join("papers/attention")).unwrap();
        std::fs::create_dir_all(dir.path().join("papers/attention-2")).unwrap();

        assert_eq!(unique_paper_slug(dir.path(), "Attention"), "attention-3");
    }

    #[test]
    fn accepts_pdf_extension_case_insensitively() {
        assert!(is_pdf_path(Path::new("source.PDF")));
        assert!(!is_pdf_path(Path::new("source.txt")));
    }
}
