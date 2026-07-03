use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperPdfOutlineItem {
    pub depth: u32,
    pub id: String,
    pub page: Option<u32>,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaperPdfOutlineState {
    Empty,
    Missing,
    Ready,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperPdfOutlineReadResult {
    pub items: Vec<PaperPdfOutlineItem>,
    pub message: Option<String>,
    pub paper_id: String,
    pub path: String,
    pub state: PaperPdfOutlineState,
}

pub fn read_paper_pdf_outline_file(
    paper_id: &str,
    source_pdf_path: &Path,
) -> PaperPdfOutlineReadResult {
    let path = source_pdf_path.to_string_lossy().into_owned();
    if !source_pdf_path.exists() {
        return PaperPdfOutlineReadResult {
            items: vec![],
            message: None,
            paper_id: paper_id.to_string(),
            path,
            state: PaperPdfOutlineState::Missing,
        };
    }

    match platform::read_pdf_outline(source_pdf_path) {
        Ok(items) if items.is_empty() => PaperPdfOutlineReadResult {
            items,
            message: None,
            paper_id: paper_id.to_string(),
            path,
            state: PaperPdfOutlineState::Empty,
        },
        Ok(items) => PaperPdfOutlineReadResult {
            items,
            message: None,
            paper_id: paper_id.to_string(),
            path,
            state: PaperPdfOutlineState::Ready,
        },
        Err(message) => PaperPdfOutlineReadResult {
            items: vec![],
            message: Some(message),
            paper_id: paper_id.to_string(),
            path,
            state: PaperPdfOutlineState::Unavailable,
        },
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::path::Path;

    use objc2::rc::autoreleasepool;
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};
    use objc2_foundation::{NSString, NSURL};

    use super::PaperPdfOutlineItem;

    #[link(name = "PDFKit", kind = "framework")]
    extern "C" {}

    pub fn read_pdf_outline(path: &Path) -> Result<Vec<PaperPdfOutlineItem>, String> {
        autoreleasepool(|_| unsafe { read_pdf_outline_inner(path) })
    }

    unsafe fn read_pdf_outline_inner(path: &Path) -> Result<Vec<PaperPdfOutlineItem>, String> {
        let pdf_path = path.to_string_lossy();
        let ns_path = NSString::from_str(&pdf_path);
        let url = NSURL::fileURLWithPath(&ns_path);
        let allocated: *mut AnyObject = msg_send![class!(PDFDocument), alloc];
        let document: *mut AnyObject = msg_send![allocated, initWithURL: &*url];
        if document.is_null() {
            return Err("PDFKit could not open source.pdf.".to_string());
        }

        let root: *mut AnyObject = msg_send![document, outlineRoot];
        if root.is_null() {
            return Ok(vec![]);
        }

        let mut items = Vec::new();
        collect_children(document, root, 0, &mut items);
        Ok(items)
    }

    unsafe fn collect_children(
        document: *mut AnyObject,
        outline: *mut AnyObject,
        depth: u32,
        items: &mut Vec<PaperPdfOutlineItem>,
    ) {
        let child_count: usize = msg_send![outline, numberOfChildren];
        for index in 0..child_count {
            let child: *mut AnyObject = msg_send![outline, childAtIndex: index];
            if child.is_null() {
                continue;
            }

            if let Some(title) = outline_title(child) {
                let item_index = items.len() + 1;
                items.push(PaperPdfOutlineItem {
                    depth: depth + 1,
                    id: format!("pdf-toc-{item_index}"),
                    page: outline_page(document, child),
                    title,
                });
            }
            collect_children(document, child, depth + 1, items);
        }
    }

    unsafe fn outline_title(outline: *mut AnyObject) -> Option<String> {
        let label: *mut NSString = msg_send![outline, label];
        if label.is_null() {
            return None;
        }
        let title = (&*label).to_string();
        if title.trim().is_empty() {
            None
        } else {
            Some(title)
        }
    }

    unsafe fn outline_page(document: *mut AnyObject, outline: *mut AnyObject) -> Option<u32> {
        let destination: *mut AnyObject = msg_send![outline, destination];
        if destination.is_null() {
            return None;
        }

        let page: *mut AnyObject = msg_send![destination, page];
        if page.is_null() {
            return None;
        }

        let index: usize = msg_send![document, indexForPage: page];
        if index == usize::MAX {
            None
        } else {
            u32::try_from(index + 1).ok()
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use std::path::Path;

    use super::PaperPdfOutlineItem;

    pub fn read_pdf_outline(_: &Path) -> Result<Vec<PaperPdfOutlineItem>, String> {
        Err("PDF outline extraction is only available on macOS in this build.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_source_pdf_returns_missing_state() {
        let result =
            read_paper_pdf_outline_file("paper-1", Path::new("/does/not/exist/source.pdf"));

        assert_eq!(result.state, PaperPdfOutlineState::Missing);
        assert!(result.items.is_empty());
    }
}
