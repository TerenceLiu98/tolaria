mod annotations;
mod blocks;
mod import;
mod markdown;
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
pub use import::{import_paper_pdf, ImportPaperPdfResult};
pub use markdown::{paper_block_anchor, paper_markdown_from_blocks, paper_note_with_markdown_body};
pub use parse::{
    parse_paper_bundle, PaperAsset, PaperParseError, PaperParseResult, PaperParseWarning,
    PaperParserProvider, PaperParserSettings,
};
pub use pdf_outline::{
    read_paper_pdf_outline_file, PaperPdfOutlineItem, PaperPdfOutlineReadResult,
    PaperPdfOutlineState,
};
