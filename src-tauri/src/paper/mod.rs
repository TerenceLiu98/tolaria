mod annotations;
mod blocks;
mod catalog;
mod import;
mod markdown;
mod metadata;
mod parse;
pub mod paths;
mod pdf_outline;

pub use annotations::{
    annotations_by_block, delete_paper_annotation_file, parse_annotations_jsonl,
    read_paper_annotations_file, reset_paper_annotations_file, save_paper_annotation_file,
    PaperAnnotation, PaperAnnotationColor, PaperAnnotationKind, PaperAnnotationsError,
    PaperAnnotationsLineError, PaperAnnotationsReadResult, PaperAnnotationsState,
};
pub use blocks::{
    find_paper_block, read_paper_blocks_file, sample_blocks_jsonl, search_paper_blocks_file,
    PaperBlockLookupResult, PaperBlockSearchResult, PaperBlocksError, PaperBlocksLineError,
    PaperBlocksReadResult, PaperBlocksState, SourceBlock,
};
pub use catalog::{
    find_paper_duplicates_file, first_author_fingerprint, list_paper_catalog_file,
    mark_paper_duplicate_decision_file, normalize_arxiv_id as normalize_catalog_arxiv_id,
    normalize_doi as normalize_catalog_doi, search_paper_catalog_file, title_fingerprint,
    PaperCatalogDuplicateCandidate, PaperCatalogDuplicateMatch, PaperCatalogDuplicateState,
    PaperCatalogEntry, PaperCatalogSourcePdfState,
};
pub use import::{import_paper_pdf, ImportPaperPdfResult};
pub use markdown::{paper_block_anchor, paper_markdown_from_blocks, paper_note_with_markdown_body};
pub use metadata::{
    apply_paper_metadata_candidate_file, extract_arxiv_id, extract_doi,
    extract_paper_metadata_file, normalize_arxiv_entry, normalize_crossref_work,
    normalize_openalex_work, read_paper_metadata_file, refresh_paper_metadata_file,
    save_paper_metadata_file, PaperMetadata, PaperMetadataCandidate, PaperMetadataError,
    PaperMetadataErrorResult, PaperMetadataReadResult, PaperMetadataSidecarState,
    PaperMetadataSource, PaperMetadataStatus, PaperMetadataValues, PaperPublicationStage,
    PaperVenueType,
};
pub use parse::{
    parse_paper_bundle, PaperAsset, PaperParseError, PaperParseResult, PaperParseWarning,
    PaperParserProvider, PaperParserSettings,
};
pub use pdf_outline::{
    read_paper_pdf_outline_file, PaperPdfOutlineItem, PaperPdfOutlineReadResult,
    PaperPdfOutlineState,
};
