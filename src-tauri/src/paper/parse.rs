use chrono::Utc;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;
use zip::ZipArchive;

use crate::frontmatter::{update_frontmatter_content, FrontmatterValue};

use super::SourceBlock;

const DEV_FIXTURE_PARSER: &str = "dev-fixture";
const DEV_FIXTURE_PARSER_VERSION: &str = "fixture-v1";
const MINERU_PARSER: &str = "mineru";
const MINERU_PARSER_VERSION: &str = "mineru-api-v4";
const MINERU_DEFAULT_API_BASE: &str = "https://mineru.net/api/v4";
const MINERU_MAX_POLL_ATTEMPTS: usize = 120;
const MINERU_POLL_INTERVAL: Duration = Duration::from_secs(3);

struct MineruParsePaths<'a> {
    paper_id: &'a str,
    paper_path: &'a Path,
    source_pdf_path: &'a Path,
    blocks_path: &'a Path,
}

struct MineruTransportConfig<'a> {
    token: &'a str,
    transport: &'a dyn MineruTransport,
    max_poll_attempts: usize,
    poll_interval: Duration,
}

struct MineruParseOutput {
    blocks: Vec<SourceBlock>,
    assets: Vec<PaperAsset>,
    warnings: Vec<PaperParseWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PaperParserProvider {
    None,
    DevFixture,
    Mineru,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperParserSettings {
    pub provider: PaperParserProvider,
    pub mineru_token_ref: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperAsset {
    pub kind: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperParseWarning {
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperParseResult {
    pub paper_id: String,
    pub provider: PaperParserProvider,
    pub parser: String,
    pub parser_version: String,
    pub parsed_at: String,
    pub paper_path: PathBuf,
    pub blocks_path: PathBuf,
    pub blocks: Vec<SourceBlock>,
    pub assets: Vec<PaperAsset>,
    pub warnings: Vec<PaperParseWarning>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperParseError {
    pub kind: String,
    pub message: String,
    pub paper_id: String,
    pub provider: PaperParserProvider,
    pub path: String,
}

impl PaperParseError {
    pub fn boundary(
        paper_id: &str,
        provider: PaperParserProvider,
        message: impl Into<String>,
    ) -> Self {
        Self {
            kind: "active_vault_boundary".to_string(),
            message: message.into(),
            paper_id: paper_id.to_string(),
            provider,
            path: String::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
struct MineruUploadRequest {
    enable_formula: bool,
    enable_table: bool,
    files: Vec<MineruUploadFile>,
    language: String,
    model_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
struct MineruUploadFile {
    data_id: String,
    is_ocr: bool,
    name: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
struct MineruUploadBatch {
    batch_id: String,
    #[serde(alias = "fileUrls", default)]
    file_urls: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
struct MineruExtractBatch {
    #[serde(alias = "extract_result", alias = "extractResults", default)]
    extract_results: Vec<MineruExtractResult>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
struct MineruExtractResult {
    #[serde(alias = "contentListUrl")]
    content_list_url: Option<String>,
    #[serde(alias = "errMsg")]
    err_msg: Option<String>,
    #[serde(alias = "fullZipUrl")]
    full_zip_url: Option<String>,
    #[serde(alias = "fileName")]
    file_name: Option<String>,
    state: String,
}

#[derive(Debug, Clone, PartialEq)]
struct MineruTransportError {
    kind: String,
    message: String,
}

trait MineruTransport {
    fn create_upload_batch(
        &self,
        token: &str,
        request: &MineruUploadRequest,
    ) -> Result<MineruUploadBatch, MineruTransportError>;
    fn upload_file(&self, upload_url: &str, bytes: &[u8]) -> Result<(), MineruTransportError>;
    fn extract_results(
        &self,
        token: &str,
        batch_id: &str,
    ) -> Result<MineruExtractBatch, MineruTransportError>;
    fn download_bytes(&self, url: &str) -> Result<Vec<u8>, MineruTransportError>;
}

struct ReqwestMineruTransport {
    api_base: String,
    client: Client,
}

impl ReqwestMineruTransport {
    fn new() -> Result<Self, MineruTransportError> {
        let api_base = env::var("TOLARIA_MINERU_API_BASE")
            .ok()
            .map(|value| value.trim().trim_end_matches('/').to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| MINERU_DEFAULT_API_BASE.to_string());
        let client = Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|error| MineruTransportError {
                kind: "http_client_failed".to_string(),
                message: format!("Failed to create MinerU HTTP client: {error}"),
            })?;

        Ok(Self { api_base, client })
    }

    fn endpoint(&self, path: &str) -> String {
        format!("{}/{}", self.api_base, path.trim_start_matches('/'))
    }
}

impl MineruTransport for ReqwestMineruTransport {
    fn create_upload_batch(
        &self,
        token: &str,
        request: &MineruUploadRequest,
    ) -> Result<MineruUploadBatch, MineruTransportError> {
        let response = self
            .client
            .post(self.endpoint("file-urls/batch"))
            .bearer_auth(token)
            .json(request)
            .send()
            .map_err(|error| MineruTransportError {
                kind: "request_failed".to_string(),
                message: format!("Failed to request MinerU upload URL: {error}"),
            })?;

        parse_mineru_envelope(
            response
                .json::<Value>()
                .map_err(|error| MineruTransportError {
                    kind: "malformed_provider_response".to_string(),
                    message: format!("MinerU upload URL response was not valid JSON: {error}"),
                })?,
        )
    }

    fn upload_file(&self, upload_url: &str, bytes: &[u8]) -> Result<(), MineruTransportError> {
        let response = self
            .client
            .put(upload_url)
            .body(bytes.to_vec())
            .send()
            .map_err(|error| MineruTransportError {
                kind: "request_failed".to_string(),
                message: format!("Failed to upload source.pdf to MinerU upload URL: {error}"),
            })?;

        if response.status().is_success() {
            return Ok(());
        }

        Err(MineruTransportError {
            kind: "remote_error".to_string(),
            message: format!("MinerU upload URL returned HTTP {}", response.status()),
        })
    }

    fn extract_results(
        &self,
        token: &str,
        batch_id: &str,
    ) -> Result<MineruExtractBatch, MineruTransportError> {
        let response = self
            .client
            .get(self.endpoint(&format!("extract-results/batch/{batch_id}")))
            .bearer_auth(token)
            .send()
            .map_err(|error| MineruTransportError {
                kind: "request_failed".to_string(),
                message: format!("Failed to poll MinerU parse result: {error}"),
            })?;

        parse_mineru_envelope(
            response
                .json::<Value>()
                .map_err(|error| MineruTransportError {
                    kind: "malformed_provider_response".to_string(),
                    message: format!("MinerU parse result response was not valid JSON: {error}"),
                })?,
        )
    }

    fn download_bytes(&self, url: &str) -> Result<Vec<u8>, MineruTransportError> {
        let response = self
            .client
            .get(url)
            .send()
            .map_err(|error| MineruTransportError {
                kind: "request_failed".to_string(),
                message: format!("Failed to download MinerU parse output: {error}"),
            })?;

        if !response.status().is_success() {
            return Err(MineruTransportError {
                kind: "remote_error".to_string(),
                message: format!("MinerU output download returned HTTP {}", response.status()),
            });
        }

        response
            .bytes()
            .map(|bytes| bytes.to_vec())
            .map_err(|error| MineruTransportError {
                kind: "request_failed".to_string(),
                message: format!("Failed to read MinerU parse output: {error}"),
            })
    }
}

fn parse_mineru_envelope<T>(value: Value) -> Result<T, MineruTransportError>
where
    T: for<'de> Deserialize<'de>,
{
    if let Some(code) = value.get("code") {
        let success = code.as_i64() == Some(0) || code.as_str() == Some("0");
        if !success {
            let code_text = code
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| code.to_string());
            let message = value
                .get("msg")
                .and_then(Value::as_str)
                .unwrap_or("MinerU returned a non-zero response code.");
            return Err(MineruTransportError {
                kind: "remote_error".to_string(),
                message: format!("MinerU returned {code_text}: {message}"),
            });
        }
    }

    if value.get("data").is_some_and(Value::is_null) {
        let message = value
            .get("msg")
            .and_then(Value::as_str)
            .unwrap_or("MinerU response data was null.");
        return Err(MineruTransportError {
            kind: "malformed_provider_response".to_string(),
            message: message.to_string(),
        });
    }

    let data = value
        .get("data")
        .cloned()
        .ok_or_else(|| MineruTransportError {
            kind: "malformed_provider_response".to_string(),
            message: "MinerU response did not include a data object.".to_string(),
        })?;

    serde_json::from_value(data).map_err(|error| MineruTransportError {
        kind: "malformed_provider_response".to_string(),
        message: format!("MinerU response data had an unexpected shape: {error}"),
    })
}

pub fn parse_paper_bundle(
    paper_id: &str,
    paper_path: &Path,
    source_pdf_path: &Path,
    blocks_path: &Path,
    settings: PaperParserSettings,
) -> Result<PaperParseResult, PaperParseError> {
    match settings.provider {
        PaperParserProvider::None => Err(parse_error(
            paper_id,
            PaperParserProvider::None,
            paper_path,
            "missing_provider",
            "Choose a paper parser provider before parsing.",
        )),
        PaperParserProvider::Mineru => {
            let token = mineru_api_token(paper_id, paper_path, &settings)?;
            let transport = ReqwestMineruTransport::new().map_err(|error| {
                parse_error(
                    paper_id,
                    PaperParserProvider::Mineru,
                    paper_path,
                    &error.kind,
                    error.message,
                )
            })?;
            parse_with_mineru_transport(
                MineruParsePaths {
                    paper_id,
                    paper_path,
                    source_pdf_path,
                    blocks_path,
                },
                MineruTransportConfig {
                    token: &token,
                    transport: &transport,
                    max_poll_attempts: MINERU_MAX_POLL_ATTEMPTS,
                    poll_interval: MINERU_POLL_INTERVAL,
                },
            )
        }
        PaperParserProvider::DevFixture => {
            parse_with_dev_fixture(paper_id, paper_path, source_pdf_path, blocks_path)
        }
    }
}

fn parse_with_dev_fixture(
    paper_id: &str,
    paper_path: &Path,
    source_pdf_path: &Path,
    blocks_path: &Path,
) -> Result<PaperParseResult, PaperParseError> {
    ensure_file_exists(
        paper_id,
        PaperParserProvider::DevFixture,
        paper_path,
        "missing_paper_note",
        "Paper note is missing.",
    )?;
    ensure_file_exists(
        paper_id,
        PaperParserProvider::DevFixture,
        source_pdf_path,
        "missing_source_pdf",
        "source.pdf is missing.",
    )?;

    let parsed_at = Utc::now().to_rfc3339();
    let blocks = dev_fixture_blocks(paper_id);
    write_blocks_jsonl(
        paper_id,
        PaperParserProvider::DevFixture,
        blocks_path,
        &blocks,
    )?;
    update_parse_frontmatter(
        paper_id,
        PaperParserProvider::DevFixture,
        paper_path,
        ParseFrontmatterUpdate {
            parsed_at: Some(parsed_at.as_str()),
            parser: Some(DEV_FIXTURE_PARSER),
            parser_version: Some(DEV_FIXTURE_PARSER_VERSION),
            status: "parsed",
            error_message: None,
        },
    )?;

    Ok(PaperParseResult {
        paper_id: paper_id.to_string(),
        provider: PaperParserProvider::DevFixture,
        parser: DEV_FIXTURE_PARSER.to_string(),
        parser_version: DEV_FIXTURE_PARSER_VERSION.to_string(),
        parsed_at,
        paper_path: paper_path.to_path_buf(),
        blocks_path: blocks_path.to_path_buf(),
        blocks,
        assets: vec![],
        warnings: vec![],
    })
}

fn dev_fixture_blocks(paper_id: &str) -> Vec<SourceBlock> {
    vec![
        SourceBlock {
            id: "b0001".to_string(),
            paper_id: paper_id.to_string(),
            kind: "title".to_string(),
            page: 1,
            hash: "sha256:fixture-title".to_string(),
            text: Some("Attention Is All You Need".to_string()),
            caption: None,
            bbox: None,
            section: None,
            order: Some(1),
            source_asset: Some("source.pdf".to_string()),
            confidence: Some(1.0),
            parser: Some(DEV_FIXTURE_PARSER.to_string()),
            extra: BTreeMap::new(),
        },
        SourceBlock {
            id: "b0002".to_string(),
            paper_id: paper_id.to_string(),
            kind: "paragraph".to_string(),
            page: 2,
            hash: "sha256:fixture-paragraph".to_string(),
            text: Some(
                "The Transformer allows for significantly more parallelization.".to_string(),
            ),
            caption: None,
            bbox: None,
            section: Some("Introduction".to_string()),
            order: Some(2),
            source_asset: Some("source.pdf".to_string()),
            confidence: Some(1.0),
            parser: Some(DEV_FIXTURE_PARSER.to_string()),
            extra: BTreeMap::new(),
        },
    ]
}

fn parse_with_mineru_transport(
    paths: MineruParsePaths<'_>,
    config: MineruTransportConfig<'_>,
) -> Result<PaperParseResult, PaperParseError> {
    ensure_file_exists(
        paths.paper_id,
        PaperParserProvider::Mineru,
        paths.paper_path,
        "missing_paper_note",
        "Paper note is missing.",
    )?;
    ensure_file_exists(
        paths.paper_id,
        PaperParserProvider::Mineru,
        paths.source_pdf_path,
        "missing_source_pdf",
        "source.pdf is missing.",
    )?;

    update_parse_frontmatter(
        paths.paper_id,
        PaperParserProvider::Mineru,
        paths.paper_path,
        ParseFrontmatterUpdate {
            error_message: None,
            parsed_at: None,
            parser: Some(MINERU_PARSER),
            parser_version: Some(MINERU_PARSER_VERSION),
            status: "parsing",
        },
    )?;

    match run_mineru_parse(
        paths.paper_id,
        paths.source_pdf_path,
        config.token,
        config.transport,
        config.max_poll_attempts,
        config.poll_interval,
    ) {
        Ok(output) => {
            let MineruParseOutput {
                blocks,
                assets,
                mut warnings,
            } = output;
            let parsed_at = Utc::now().to_rfc3339();
            if paths.blocks_path.exists() {
                warnings.push(PaperParseWarning {
                    kind: "replaced_existing_blocks".to_string(),
                    message: "Existing blocks.jsonl was replaced after a successful parse."
                        .to_string(),
                });
            }
            if let Err(error) = write_blocks_jsonl(
                paths.paper_id,
                PaperParserProvider::Mineru,
                paths.blocks_path,
                &blocks,
            ) {
                mark_mineru_parse_failed(paths.paper_id, paths.paper_path, error.message.as_str());
                return Err(error);
            }
            if let Err(error) = update_parse_frontmatter(
                paths.paper_id,
                PaperParserProvider::Mineru,
                paths.paper_path,
                ParseFrontmatterUpdate {
                    error_message: None,
                    parsed_at: Some(parsed_at.as_str()),
                    parser: Some(MINERU_PARSER),
                    parser_version: Some(MINERU_PARSER_VERSION),
                    status: "parsed",
                },
            ) {
                mark_mineru_parse_failed(paths.paper_id, paths.paper_path, error.message.as_str());
                return Err(error);
            }

            Ok(PaperParseResult {
                paper_id: paths.paper_id.to_string(),
                provider: PaperParserProvider::Mineru,
                parser: MINERU_PARSER.to_string(),
                parser_version: MINERU_PARSER_VERSION.to_string(),
                parsed_at,
                paper_path: paths.paper_path.to_path_buf(),
                blocks_path: paths.blocks_path.to_path_buf(),
                blocks,
                assets,
                warnings,
            })
        }
        Err(error) => {
            mark_mineru_parse_failed(paths.paper_id, paths.paper_path, error.message.as_str());
            Err(error)
        }
    }
}

fn mark_mineru_parse_failed(paper_id: &str, paper_path: &Path, message: &str) {
    let _ = update_parse_frontmatter(
        paper_id,
        PaperParserProvider::Mineru,
        paper_path,
        ParseFrontmatterUpdate {
            error_message: Some(message),
            parsed_at: None,
            parser: Some(MINERU_PARSER),
            parser_version: Some(MINERU_PARSER_VERSION),
            status: "failed",
        },
    );
}

fn run_mineru_parse(
    paper_id: &str,
    source_pdf_path: &Path,
    token: &str,
    transport: &dyn MineruTransport,
    max_poll_attempts: usize,
    poll_interval: Duration,
) -> Result<MineruParseOutput, PaperParseError> {
    let source_bytes = fs::read(source_pdf_path).map_err(|error| {
        parse_error(
            paper_id,
            PaperParserProvider::Mineru,
            source_pdf_path,
            "read_failed",
            format!("Failed to read source.pdf for parsing: {error}"),
        )
    })?;
    let request = build_mineru_upload_request(paper_id, source_pdf_path);
    let upload_batch = transport
        .create_upload_batch(token, &request)
        .map_err(|error| mineru_transport_parse_error(paper_id, source_pdf_path, error))?;
    let upload_url = upload_url_for_source(&upload_batch, source_pdf_path).ok_or_else(|| {
        parse_error(
            paper_id,
            PaperParserProvider::Mineru,
            source_pdf_path,
            "malformed_provider_response",
            "MinerU did not return an upload URL for source.pdf.",
        )
    })?;

    transport
        .upload_file(upload_url, &source_bytes)
        .map_err(|error| mineru_transport_parse_error(paper_id, source_pdf_path, error))?;
    let result = wait_for_mineru_result(
        paper_id,
        source_pdf_path,
        token,
        upload_batch.batch_id.as_str(),
        transport,
        max_poll_attempts,
        poll_interval,
    )?;
    let content_list = download_mineru_content_list(paper_id, source_pdf_path, &result, transport)?;
    let blocks =
        normalize_mineru_content_list(paper_id, content_list.as_str()).map_err(|error| {
            parse_error(
                paper_id,
                PaperParserProvider::Mineru,
                source_pdf_path,
                error.kind.as_str(),
                error.message,
            )
        })?;

    Ok(MineruParseOutput {
        blocks,
        assets: vec![PaperAsset {
            kind: "source_pdf".to_string(),
            path: "source.pdf".to_string(),
        }],
        warnings: vec![],
    })
}

fn build_mineru_upload_request(paper_id: &str, source_pdf_path: &Path) -> MineruUploadRequest {
    let file_name = source_pdf_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("source.pdf")
        .to_string();

    MineruUploadRequest {
        enable_formula: true,
        enable_table: true,
        files: vec![MineruUploadFile {
            data_id: paper_id.to_string(),
            is_ocr: true,
            name: file_name,
        }],
        language: "en".to_string(),
        model_version: "vlm".to_string(),
    }
}

fn upload_url_for_source<'a>(
    upload_batch: &'a MineruUploadBatch,
    _source_pdf_path: &Path,
) -> Option<&'a str> {
    upload_batch.file_urls.first().map(String::as_str)
}

fn wait_for_mineru_result(
    paper_id: &str,
    source_pdf_path: &Path,
    token: &str,
    batch_id: &str,
    transport: &dyn MineruTransport,
    max_poll_attempts: usize,
    poll_interval: Duration,
) -> Result<MineruExtractResult, PaperParseError> {
    for attempt in 0..max_poll_attempts {
        let batch = transport
            .extract_results(token, batch_id)
            .map_err(|error| mineru_transport_parse_error(paper_id, source_pdf_path, error))?;
        let Some(result) = batch.extract_results.first().cloned() else {
            return Err(parse_error(
                paper_id,
                PaperParserProvider::Mineru,
                source_pdf_path,
                "malformed_provider_response",
                "MinerU did not return parse results for the upload batch.",
            ));
        };

        match result.state.as_str() {
            "done" => return Ok(result),
            "failed" => {
                return Err(parse_error(
                    paper_id,
                    PaperParserProvider::Mineru,
                    source_pdf_path,
                    "remote_parse_failed",
                    result
                        .err_msg
                        .unwrap_or_else(|| "MinerU parsing failed.".to_string()),
                ));
            }
            "pending" | "running" | "converting" | "waiting-file" => {
                if attempt + 1 < max_poll_attempts && !poll_interval.is_zero() {
                    thread::sleep(poll_interval);
                }
            }
            other => {
                return Err(parse_error(
                    paper_id,
                    PaperParserProvider::Mineru,
                    source_pdf_path,
                    "malformed_provider_response",
                    format!("MinerU returned an unknown parse state: {other}"),
                ));
            }
        }
    }

    Err(parse_error(
        paper_id,
        PaperParserProvider::Mineru,
        source_pdf_path,
        "timeout",
        "MinerU parsing did not finish before the timeout.",
    ))
}

fn download_mineru_content_list(
    paper_id: &str,
    source_pdf_path: &Path,
    result: &MineruExtractResult,
    transport: &dyn MineruTransport,
) -> Result<String, PaperParseError> {
    if let Some(content_list_url) = result.content_list_url.as_deref() {
        let bytes = transport
            .download_bytes(content_list_url)
            .map_err(|error| mineru_transport_parse_error(paper_id, source_pdf_path, error))?;
        return String::from_utf8(bytes).map_err(|error| {
            parse_error(
                paper_id,
                PaperParserProvider::Mineru,
                source_pdf_path,
                "malformed_provider_output",
                format!("MinerU content_list output was not UTF-8: {error}"),
            )
        });
    }

    let Some(zip_url) = result.full_zip_url.as_deref() else {
        return Err(parse_error(
            paper_id,
            PaperParserProvider::Mineru,
            source_pdf_path,
            "malformed_provider_response",
            "MinerU parse result did not include a content list URL or ZIP URL.",
        ));
    };
    let bytes = transport
        .download_bytes(zip_url)
        .map_err(|error| mineru_transport_parse_error(paper_id, source_pdf_path, error))?;

    content_list_json_from_zip(&bytes).map_err(|error| {
        parse_error(
            paper_id,
            PaperParserProvider::Mineru,
            source_pdf_path,
            error.kind.as_str(),
            error.message,
        )
    })
}

fn content_list_json_from_zip(bytes: &[u8]) -> Result<String, MineruTransportError> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|error| MineruTransportError {
            kind: "malformed_provider_output".to_string(),
            message: format!("MinerU ZIP output could not be opened: {error}"),
        })?;

    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| MineruTransportError {
                kind: "malformed_provider_output".to_string(),
                message: format!("MinerU ZIP entry could not be read: {error}"),
            })?;
        let name = file.name().replace('\\', "/");
        if !name.ends_with("_content_list.json") && !name.ends_with("content_list.json") {
            continue;
        }

        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|error| MineruTransportError {
                kind: "malformed_provider_output".to_string(),
                message: format!("MinerU content list ZIP entry was not UTF-8 JSON: {error}"),
            })?;
        return Ok(content);
    }

    Err(MineruTransportError {
        kind: "malformed_provider_output".to_string(),
        message: "MinerU ZIP output did not contain a content_list JSON file.".to_string(),
    })
}

fn mineru_transport_parse_error(
    paper_id: &str,
    source_pdf_path: &Path,
    error: MineruTransportError,
) -> PaperParseError {
    parse_error(
        paper_id,
        PaperParserProvider::Mineru,
        source_pdf_path,
        error.kind.as_str(),
        error.message,
    )
}

fn normalize_mineru_content_list(
    paper_id: &str,
    content: &str,
) -> Result<Vec<SourceBlock>, MineruTransportError> {
    let value = serde_json::from_str::<Value>(content).map_err(|error| MineruTransportError {
        kind: "malformed_provider_output".to_string(),
        message: format!("MinerU content list was not valid JSON: {error}"),
    })?;
    let items = mineru_content_items(&value).ok_or_else(|| MineruTransportError {
        kind: "malformed_provider_output".to_string(),
        message: "MinerU content list must be a JSON array or contain a content_list array."
            .to_string(),
    })?;

    let mut blocks = Vec::new();
    let mut current_section: Option<String> = None;
    for item in items {
        let Some(object) = item.as_object() else {
            return Err(MineruTransportError {
                kind: "malformed_provider_output".to_string(),
                message: "MinerU content list entries must be JSON objects.".to_string(),
            });
        };

        let raw_type = string_field(object, &["type", "kind", "category"]);
        let kind = normalize_mineru_kind(raw_type.as_deref(), object);
        let text = mineru_block_text(&kind, object);
        let caption = mineru_caption(object);
        if text.is_none() && caption.is_none() && kind != "figure" {
            continue;
        }

        let order = (blocks.len() + 1) as u32;
        let page = mineru_page_number(object);
        let bbox = mineru_bbox(object);
        let section = if kind == "heading" {
            current_section = text.clone();
            None
        } else {
            current_section.clone()
        };
        let mut extra = BTreeMap::new();
        if let Some(raw_type) = raw_type {
            extra.insert("mineru_type".to_string(), Value::String(raw_type));
        }

        blocks.push(SourceBlock {
            id: format!("b{order:04}"),
            paper_id: paper_id.to_string(),
            kind,
            page,
            hash: source_block_hash(paper_id, page, order, text.as_deref(), caption.as_deref()),
            text,
            caption,
            bbox,
            section,
            order: Some(order),
            source_asset: Some("source.pdf".to_string()),
            confidence: number_field(object, &["confidence", "score"]),
            parser: Some(MINERU_PARSER.to_string()),
            extra,
        });
    }

    if blocks.is_empty() {
        return Err(MineruTransportError {
            kind: "malformed_provider_output".to_string(),
            message: "MinerU content list did not contain any usable SourceBlocks.".to_string(),
        });
    }

    Ok(blocks)
}

fn mineru_content_items(value: &Value) -> Option<&Vec<Value>> {
    if let Some(items) = value.as_array() {
        return Some(items);
    }

    value
        .get("content_list")
        .or_else(|| value.get("contentList"))
        .or_else(|| value.get("items"))
        .or_else(|| value.get("blocks"))
        .and_then(Value::as_array)
}

fn normalize_mineru_kind(
    raw_type: Option<&str>,
    object: &serde_json::Map<String, Value>,
) -> String {
    let normalized = raw_type.unwrap_or("text").trim().to_lowercase();
    match normalized.as_str() {
        "title" => "title".to_string(),
        "heading" | "header" => "heading".to_string(),
        "text" | "paragraph" => {
            if number_field(object, &["text_level", "level"]).is_some() {
                "heading".to_string()
            } else {
                "paragraph".to_string()
            }
        }
        "image" | "figure" => "figure".to_string(),
        "table" => "table".to_string(),
        "equation" | "formula" | "interline_equation" | "inline_equation" => "equation".to_string(),
        "caption" | "image_caption" | "table_caption" => "caption".to_string(),
        _ => "paragraph".to_string(),
    }
}

fn mineru_block_text(kind: &str, object: &serde_json::Map<String, Value>) -> Option<String> {
    let keys: &[&str] = match kind {
        "table" => &["text", "table_body", "html", "content", "markdown"],
        "equation" => &["text", "latex", "content"],
        "figure" => &["text", "content"],
        _ => &["text", "content", "markdown"],
    };
    string_field(object, keys)
}

fn mineru_caption(object: &serde_json::Map<String, Value>) -> Option<String> {
    string_field(object, &["caption"])
        .or_else(|| joined_string_array_field(object, &["image_caption", "table_caption"]))
}

fn mineru_page_number(object: &serde_json::Map<String, Value>) -> u32 {
    integer_field(object, &["page", "page_number"])
        .or_else(|| integer_field(object, &["page_idx"]).map(|page| page + 1))
        .unwrap_or(1)
        .max(1)
}

fn mineru_bbox(object: &serde_json::Map<String, Value>) -> Option<Vec<f64>> {
    object
        .get("bbox")
        .or_else(|| object.get("box"))
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_f64)
                .collect::<Vec<f64>>()
        })
        .filter(|values| !values.is_empty())
}

fn string_field(object: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(|value| {
            value
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
        })
}

fn joined_string_array_field(
    object: &serde_json::Map<String, Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .filter_map(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .collect::<Vec<&str>>()
                .join(" ")
        })
        .find(|value| !value.is_empty())
}

fn number_field(object: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<f64> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(Value::as_f64)
}

fn integer_field(object: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<u32> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(|value| value.as_u64().and_then(|number| u32::try_from(number).ok()))
}

fn source_block_hash(
    paper_id: &str,
    page: u32,
    order: u32,
    text: Option<&str>,
    caption: Option<&str>,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(paper_id.as_bytes());
    hasher.update(b"\0");
    hasher.update(page.to_string().as_bytes());
    hasher.update(b"\0");
    hasher.update(order.to_string().as_bytes());
    hasher.update(b"\0");
    hasher.update(text.unwrap_or("").as_bytes());
    hasher.update(b"\0");
    hasher.update(caption.unwrap_or("").as_bytes());
    format!("sha256:{}", hex::encode(hasher.finalize()))
}

fn write_blocks_jsonl(
    paper_id: &str,
    provider: PaperParserProvider,
    blocks_path: &Path,
    blocks: &[SourceBlock],
) -> Result<(), PaperParseError> {
    if let Some(parent) = blocks_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            parse_error(
                paper_id,
                provider.clone(),
                blocks_path,
                "write_failed",
                format!("Failed to create paper sidecar directory: {error}"),
            )
        })?;
    }

    let mut content = String::new();
    for block in blocks {
        let line = serde_json::to_string(block).map_err(|error| {
            parse_error(
                paper_id,
                provider.clone(),
                blocks_path,
                "serialize_failed",
                format!("Failed to serialize SourceBlock: {error}"),
            )
        })?;
        content.push_str(&line);
        content.push('\n');
    }

    let temp_path = blocks_path.with_extension("jsonl.tmp");
    fs::write(&temp_path, content).map_err(|error| {
        parse_error(
            paper_id,
            provider.clone(),
            blocks_path,
            "write_failed",
            format!("Failed to write temporary blocks.jsonl: {error}"),
        )
    })?;

    fs::rename(&temp_path, blocks_path).map_err(|error| {
        let _ = fs::remove_file(&temp_path);
        parse_error(
            paper_id,
            provider,
            blocks_path,
            "write_failed",
            format!("Failed to replace blocks.jsonl: {error}"),
        )
    })
}

struct ParseFrontmatterUpdate<'a> {
    error_message: Option<&'a str>,
    parsed_at: Option<&'a str>,
    parser: Option<&'a str>,
    parser_version: Option<&'a str>,
    status: &'a str,
}

fn update_parse_frontmatter(
    paper_id: &str,
    provider: PaperParserProvider,
    paper_path: &Path,
    update: ParseFrontmatterUpdate<'_>,
) -> Result<(), PaperParseError> {
    let content = fs::read_to_string(paper_path).map_err(|error| {
        parse_error(
            paper_id,
            provider.clone(),
            paper_path,
            "read_failed",
            format!("Failed to read Paper note: {error}"),
        )
    })?;
    let updated = update_frontmatter_content(
        &content,
        "parse_status",
        Some(FrontmatterValue::String(update.status.to_string())),
    )
    .and_then(|content| {
        update_frontmatter_content(
            &content,
            "parser_provider",
            Some(FrontmatterValue::String(
                provider_slug(&provider).to_string(),
            )),
        )
    })
    .and_then(|content| {
        update_frontmatter_content(
            &content,
            "parser_version",
            update
                .parser_version
                .map(|version| FrontmatterValue::String(version.to_string())),
        )
    })
    .and_then(|content| {
        update_frontmatter_content(
            &content,
            "parsed_at",
            update
                .parsed_at
                .map(|parsed_at| FrontmatterValue::String(parsed_at.to_string())),
        )
    })
    .and_then(|content| {
        update_frontmatter_content(
            &content,
            "parser",
            update
                .parser
                .map(|parser| FrontmatterValue::String(parser.to_string())),
        )
    })
    .and_then(|content| {
        update_frontmatter_content(
            &content,
            "parse_error",
            update
                .error_message
                .map(|message| FrontmatterValue::String(message.to_string())),
        )
    })
    .map_err(|error| {
        parse_error(
            paper_id,
            provider.clone(),
            paper_path,
            "frontmatter_update_failed",
            format!("Failed to update Paper parse metadata: {error}"),
        )
    })?;

    fs::write(paper_path, updated).map_err(|error| {
        parse_error(
            paper_id,
            provider,
            paper_path,
            "write_failed",
            format!("Failed to update Paper note: {error}"),
        )
    })
}

fn ensure_file_exists(
    paper_id: &str,
    provider: PaperParserProvider,
    path: &Path,
    kind: &str,
    message: &str,
) -> Result<(), PaperParseError> {
    if path.is_file() {
        return Ok(());
    }

    Err(parse_error(paper_id, provider, path, kind, message))
}

fn mineru_token_ref(settings: &PaperParserSettings) -> Option<&str> {
    settings
        .mineru_token_ref
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn strip_bearer_prefix(value: &str) -> &str {
    value
        .strip_prefix("Bearer ")
        .or_else(|| value.strip_prefix("bearer "))
        .unwrap_or(value)
        .trim()
}

fn looks_like_environment_reference(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    (first.is_ascii_alphabetic() || first == '_')
        && chars.all(|candidate| candidate.is_ascii_alphanumeric() || candidate == '_')
}

fn mineru_api_token(
    paper_id: &str,
    paper_path: &Path,
    settings: &PaperParserSettings,
) -> Result<String, PaperParseError> {
    let Some(token_config) = mineru_token_ref(settings) else {
        return Err(parse_error(
            paper_id,
            PaperParserProvider::Mineru,
            paper_path,
            "missing_config",
            "MinerU parsing requires an API token or token environment variable.",
        ));
    };

    let token_config = strip_bearer_prefix(token_config);

    if !looks_like_environment_reference(token_config) {
        return Ok(token_config.to_string());
    }

    env::var(token_config)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            parse_error(
                paper_id,
                PaperParserProvider::Mineru,
                paper_path,
                "missing_config",
                format!("MinerU token environment variable `{token_config}` is not available in this process environment."),
            )
        })
}

fn provider_slug(provider: &PaperParserProvider) -> &'static str {
    match provider {
        PaperParserProvider::None => "none",
        PaperParserProvider::DevFixture => "dev-fixture",
        PaperParserProvider::Mineru => "mineru",
    }
}

fn parse_error(
    paper_id: &str,
    provider: PaperParserProvider,
    path: &Path,
    kind: &str,
    message: impl Into<String>,
) -> PaperParseError {
    PaperParseError {
        kind: kind.to_string(),
        message: message.into(),
        paper_id: paper_id.to_string(),
        provider,
        path: path.to_string_lossy().into_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::cell::RefCell;
    use tempfile::TempDir;

    #[derive(Clone)]
    struct FakeMineruTransport {
        download_result: Result<Vec<u8>, MineruTransportError>,
        extract_result: Result<MineruExtractBatch, MineruTransportError>,
        upload_batch_result: Result<MineruUploadBatch, MineruTransportError>,
        upload_result: Result<(), MineruTransportError>,
        captured_request: RefCell<Option<Value>>,
        uploaded_bytes: RefCell<Vec<u8>>,
    }

    impl FakeMineruTransport {
        fn with_content_list(content: String) -> Self {
            Self {
                download_result: Ok(content.into_bytes()),
                extract_result: Ok(MineruExtractBatch {
                    extract_results: vec![MineruExtractResult {
                        content_list_url: Some(
                            "https://mineru.example/content_list.json".to_string(),
                        ),
                        err_msg: None,
                        file_name: Some("source.pdf".to_string()),
                        full_zip_url: None,
                        state: "done".to_string(),
                    }],
                }),
                upload_batch_result: Ok(MineruUploadBatch {
                    batch_id: "batch-1".to_string(),
                    file_urls: vec!["https://mineru.example/upload".to_string()],
                }),
                upload_result: Ok(()),
                captured_request: RefCell::new(None),
                uploaded_bytes: RefCell::new(Vec::new()),
            }
        }
    }

    impl MineruTransport for FakeMineruTransport {
        fn create_upload_batch(
            &self,
            _token: &str,
            request: &MineruUploadRequest,
        ) -> Result<MineruUploadBatch, MineruTransportError> {
            *self.captured_request.borrow_mut() = Some(serde_json::to_value(request).unwrap());
            self.upload_batch_result.clone()
        }

        fn upload_file(&self, _upload_url: &str, bytes: &[u8]) -> Result<(), MineruTransportError> {
            *self.uploaded_bytes.borrow_mut() = bytes.to_vec();
            self.upload_result.clone()
        }

        fn extract_results(
            &self,
            _token: &str,
            _batch_id: &str,
        ) -> Result<MineruExtractBatch, MineruTransportError> {
            self.extract_result.clone()
        }

        fn download_bytes(&self, _url: &str) -> Result<Vec<u8>, MineruTransportError> {
            self.download_result.clone()
        }
    }

    fn sample_mineru_content_list() -> String {
        json!([
            {"type":"title","text":"Deep Learning for Functional Data","page_idx":0,"bbox":[10,20,300,60]},
            {"type":"text","text_level":1,"text":"Introduction","page_idx":0},
            {"type":"text","text":"Functional observations are random curves.","page_idx":0},
            {"type":"image","image_caption":["Figure 1. Model overview"],"page_idx":1,"bbox":[20,30,120,180]},
            {"type":"table","table_caption":["Table 1. Accuracy"],"table_body":"| Method | Score |","page_idx":2},
            {"type":"interline_equation","latex":"y = f(x)","page_idx":2},
            {"type":"caption","text":"Additional caption","page":4}
        ])
        .to_string()
    }

    fn write_paper_bundle(root: &Path, paper_id: &str) -> (PathBuf, PathBuf, PathBuf) {
        let paper_dir = root.join("papers").join(paper_id);
        fs::create_dir_all(&paper_dir).unwrap();
        let paper_path = paper_dir.join("paper.md");
        let source_pdf_path = paper_dir.join("source.pdf");
        let blocks_path = paper_dir.join("blocks.jsonl");
        fs::write(&source_pdf_path, b"%PDF-1.7 mineru fixture").unwrap();
        fs::write(
            &paper_path,
            format!(
                "---\ntype: Paper\npaper_id: {paper_id}\ntitle: Fixture Paper\nparse_status: unparsed\nsource_pdf: source.pdf\nblocks: blocks.jsonl\n---\n# Fixture Paper\n"
            ),
        )
        .unwrap();
        (paper_path, source_pdf_path, blocks_path)
    }

    #[test]
    fn mineru_upload_request_uses_source_pdf_and_paper_id() {
        let request = build_mineru_upload_request(
            "2106-10414v1",
            Path::new("/vault/papers/2106-10414v1/source.pdf"),
        );

        assert!(request.enable_formula);
        assert!(request.enable_table);
        assert_eq!(request.files[0].name, "source.pdf");
        assert_eq!(request.files[0].data_id, "2106-10414v1");
        assert_eq!(request.model_version, "vlm");
    }

    #[test]
    fn mineru_upload_envelope_accepts_official_file_urls_shape() {
        let batch: MineruUploadBatch = parse_mineru_envelope(json!({
            "code": 0,
            "msg": "ok",
            "data": {
                "batch_id": "batch-1",
                "file_urls": ["https://mineru.example/upload"]
            }
        }))
        .unwrap();

        assert_eq!(batch.batch_id, "batch-1");
        assert_eq!(batch.file_urls, vec!["https://mineru.example/upload"]);
    }

    #[test]
    fn mineru_envelope_reports_string_error_codes_before_deserializing_data() {
        let error = parse_mineru_envelope::<MineruUploadBatch>(json!({
            "code": "A0202",
            "msg": "Token is invalid or expired",
            "data": null,
            "trace_id": "trace-1"
        }))
        .expect_err("expected MinerU error envelope to fail");

        assert_eq!(error.kind, "remote_error");
        assert!(error.message.contains("A0202"));
        assert!(error.message.contains("Token is invalid or expired"));
    }

    #[test]
    fn mineru_extract_envelope_accepts_official_extract_result_shape() {
        let batch: MineruExtractBatch = parse_mineru_envelope(json!({
            "code": 0,
            "msg": "ok",
            "data": {
                "extract_result": [{
                    "file_name": "source.pdf",
                    "state": "done",
                    "full_zip_url": "https://mineru.example/result.zip"
                }]
            }
        }))
        .unwrap();

        assert_eq!(batch.extract_results.len(), 1);
        assert_eq!(batch.extract_results[0].state, "done");
        assert_eq!(
            batch.extract_results[0].full_zip_url.as_deref(),
            Some("https://mineru.example/result.zip")
        );
    }

    #[test]
    fn mineru_token_ref_resolves_from_process_environment() {
        let temp = TempDir::new().unwrap();
        let paper_path = temp.path().join("paper.md");
        let env_name = "TOLARIA_TEST_MINERU_TOKEN_REF";
        env::remove_var(env_name);
        let settings = PaperParserSettings {
            mineru_token_ref: Some(env_name.to_string()),
            provider: PaperParserProvider::Mineru,
        };

        let missing = mineru_api_token("paper-1", &paper_path, &settings)
            .expect_err("expected missing environment token to fail");
        assert_eq!(missing.kind, "missing_config");

        env::set_var(env_name, " secret-token ");
        assert_eq!(
            mineru_api_token("paper-1", &paper_path, &settings).unwrap(),
            "secret-token"
        );
        env::remove_var(env_name);
    }

    #[test]
    fn mineru_token_ref_accepts_direct_api_token_without_environment_lookup() {
        let temp = TempDir::new().unwrap();
        let paper_path = temp.path().join("paper.md");
        let direct_token = "eyJ0eXBlIjoiSldUIiwiYWxnIjoiSFM1MTIifQ.payload.signature";
        let settings = PaperParserSettings {
            mineru_token_ref: Some(format!(" {direct_token} ")),
            provider: PaperParserProvider::Mineru,
        };

        assert_eq!(
            mineru_api_token("paper-1", &paper_path, &settings).unwrap(),
            direct_token
        );
    }

    #[test]
    fn mineru_token_ref_strips_bearer_prefix_from_settings_value() {
        let temp = TempDir::new().unwrap();
        let paper_path = temp.path().join("paper.md");
        let direct_token = "api-token-from-mineru-settings";
        let settings = PaperParserSettings {
            mineru_token_ref: Some(format!("Bearer {direct_token}")),
            provider: PaperParserProvider::Mineru,
        };

        assert_eq!(
            mineru_api_token("paper-1", &paper_path, &settings).unwrap(),
            direct_token
        );
    }

    #[test]
    fn normalizes_sample_mineru_content_list_to_source_blocks() {
        let blocks =
            normalize_mineru_content_list("paper-1", sample_mineru_content_list().as_str())
                .unwrap();

        assert_eq!(blocks.len(), 7);
        assert_eq!(blocks[0].kind, "title");
        assert_eq!(blocks[0].page, 1);
        assert_eq!(blocks[0].bbox, Some(vec![10.0, 20.0, 300.0, 60.0]));
        assert_eq!(blocks[1].kind, "heading");
        assert_eq!(blocks[2].kind, "paragraph");
        assert_eq!(blocks[2].section.as_deref(), Some("Introduction"));
        assert_eq!(blocks[3].kind, "figure");
        assert_eq!(
            blocks[3].caption.as_deref(),
            Some("Figure 1. Model overview")
        );
        assert_eq!(blocks[4].kind, "table");
        assert_eq!(blocks[5].kind, "equation");
        assert_eq!(blocks[6].kind, "caption");
        assert_eq!(
            blocks[0].hash,
            normalize_mineru_content_list("paper-1", sample_mineru_content_list().as_str())
                .unwrap()[0]
                .hash
        );
    }

    #[test]
    fn mineru_parse_success_writes_normalized_blocks_and_metadata() {
        let temp = TempDir::new().unwrap();
        let (paper_path, source_pdf_path, blocks_path) = write_paper_bundle(temp.path(), "paper-1");
        let transport = FakeMineruTransport::with_content_list(sample_mineru_content_list());

        let result = parse_with_mineru_transport(
            MineruParsePaths {
                paper_id: "paper-1",
                paper_path: &paper_path,
                source_pdf_path: &source_pdf_path,
                blocks_path: &blocks_path,
            },
            MineruTransportConfig {
                token: "secret-token",
                transport: &transport,
                max_poll_attempts: 1,
                poll_interval: Duration::from_secs(0),
            },
        )
        .unwrap();

        assert_eq!(result.provider, PaperParserProvider::Mineru);
        assert_eq!(result.blocks.len(), 7);
        assert_eq!(
            *transport.uploaded_bytes.borrow(),
            b"%PDF-1.7 mineru fixture"
        );
        let blocks_jsonl = fs::read_to_string(&blocks_path).unwrap();
        assert!(blocks_jsonl.contains("\"parser\":\"mineru\""));
        let paper = fs::read_to_string(&paper_path).unwrap();
        assert!(paper.contains("parse_status: parsed"));
        assert!(paper.contains("parser_provider: mineru"));
        assert!(paper.contains("parser_version: mineru-api-v4"));
        assert!(!paper.contains("secret-token"));
    }

    #[test]
    fn mineru_parse_failure_preserves_existing_blocks() {
        let temp = TempDir::new().unwrap();
        let (paper_path, source_pdf_path, blocks_path) = write_paper_bundle(temp.path(), "paper-1");
        let existing = "{\"id\":\"old\",\"paper_id\":\"paper-1\",\"kind\":\"paragraph\",\"page\":1,\"hash\":\"sha256:old\",\"text\":\"old\"}\n";
        fs::write(&blocks_path, existing).unwrap();
        let mut transport = FakeMineruTransport::with_content_list(sample_mineru_content_list());
        transport.upload_batch_result = Err(MineruTransportError {
            kind: "remote_error".to_string(),
            message: "quota exceeded".to_string(),
        });

        let error = parse_with_mineru_transport(
            MineruParsePaths {
                paper_id: "paper-1",
                paper_path: &paper_path,
                source_pdf_path: &source_pdf_path,
                blocks_path: &blocks_path,
            },
            MineruTransportConfig {
                token: "secret-token",
                transport: &transport,
                max_poll_attempts: 1,
                poll_interval: Duration::from_secs(0),
            },
        )
        .expect_err("expected remote parse failure");

        assert_eq!(error.kind, "remote_error");
        assert_eq!(fs::read_to_string(&blocks_path).unwrap(), existing);
        let paper = fs::read_to_string(&paper_path).unwrap();
        assert!(paper.contains("parse_status: failed"));
        assert!(paper.contains("parse_error: quota exceeded"));
    }

    #[test]
    fn mineru_waiting_file_state_is_recoverable_polling_state() {
        let temp = TempDir::new().unwrap();
        let (_paper_path, source_pdf_path, _blocks_path) =
            write_paper_bundle(temp.path(), "paper-1");
        let mut transport = FakeMineruTransport::with_content_list(sample_mineru_content_list());
        transport.extract_result = Ok(MineruExtractBatch {
            extract_results: vec![MineruExtractResult {
                content_list_url: None,
                err_msg: None,
                file_name: Some("source.pdf".to_string()),
                full_zip_url: None,
                state: "waiting-file".to_string(),
            }],
        });

        let error = wait_for_mineru_result(
            "paper-1",
            &source_pdf_path,
            "secret-token",
            "batch-1",
            &transport,
            1,
            Duration::from_secs(0),
        )
        .expect_err("expected timeout while MinerU waits for uploaded file");

        assert_eq!(error.kind, "timeout");
        assert!(!error.message.contains("unknown parse state"));
    }

    #[test]
    fn malformed_mineru_output_preserves_existing_blocks() {
        let temp = TempDir::new().unwrap();
        let (paper_path, source_pdf_path, blocks_path) = write_paper_bundle(temp.path(), "paper-1");
        let existing = "{\"id\":\"old\",\"paper_id\":\"paper-1\",\"kind\":\"paragraph\",\"page\":1,\"hash\":\"sha256:old\",\"text\":\"old\"}\n";
        fs::write(&blocks_path, existing).unwrap();
        let transport = FakeMineruTransport::with_content_list("{}".to_string());

        let error = parse_with_mineru_transport(
            MineruParsePaths {
                paper_id: "paper-1",
                paper_path: &paper_path,
                source_pdf_path: &source_pdf_path,
                blocks_path: &blocks_path,
            },
            MineruTransportConfig {
                token: "secret-token",
                transport: &transport,
                max_poll_attempts: 1,
                poll_interval: Duration::from_secs(0),
            },
        )
        .expect_err("expected malformed provider output");

        assert_eq!(error.kind, "malformed_provider_output");
        assert_eq!(fs::read_to_string(&blocks_path).unwrap(), existing);
        let paper = fs::read_to_string(&paper_path).unwrap();
        assert!(paper.contains("parse_status: failed"));
    }
}
