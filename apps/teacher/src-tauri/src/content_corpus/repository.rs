use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use sha2::{Digest, Sha256};
use tauri::{path::BaseDirectory, AppHandle, Manager};

use super::domain::{CorpusAttribution, TextbookExcerpt, TextbookFigure};

const CORPUS_PATH: &str = "resources/content/siyavula-jss1-mathematics-v1/corpus.sqlite3";
const EXPECTED_PACKAGE_ID: &str = "siyavula-jss1-mathematics-v1";
const EXPECTED_FORMAT_VERSION: &str = "2";
const MAX_SECTION_EXCERPTS: usize = 3;
const MAX_LESSON_PLANNING_EXCERPTS: usize = 12;

type Result<T> = std::result::Result<T, String>;

#[derive(Default)]
pub struct ContentCorpus {
    connection: Mutex<Option<Connection>>,
    search_index: Mutex<Option<Connection>>,
    package_root: Mutex<Option<PathBuf>>,
}

impl ContentCorpus {
    pub fn init_from_app(&self, app: &AppHandle) -> Result<()> {
        let path = app
            .path()
            .resolve(CORPUS_PATH, BaseDirectory::Resource)
            .map_err(|_| "The installed source library could not be located.".to_owned())?;
        self.init_at(&path)
    }

    pub(crate) fn init_at(&self, path: &Path) -> Result<()> {
        let connection = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|_| "The installed source library could not be opened.".to_owned())?;
        validate_corpus(&connection)?;
        let search_index = super::search::build_index(&connection)?;
        *self
            .search_index
            .lock()
            .map_err(|error| error.to_string())? = Some(search_index);
        *self.connection.lock().map_err(|error| error.to_string())? = Some(connection);
        *self
            .package_root
            .lock()
            .map_err(|error| error.to_string())? = Some(
            path.parent()
                .ok_or_else(|| "The installed source library path is invalid.".to_owned())?
                .to_owned(),
        );
        Ok(())
    }

    pub fn resolve_record_ids(&self, record_ids: &[String]) -> Result<Vec<TextbookExcerpt>> {
        let mut seen = HashSet::new();
        let requested = record_ids
            .iter()
            .filter(|record_id| seen.insert((*record_id).clone()))
            .collect::<Vec<_>>();
        // The cap is a context budget, and it used to be applied silently. A
        // caller whose records were dropped here saw no sign of it until a
        // later stage rejected work for citing evidence the run never held, so
        // the count that was left behind is now reported to the caller.
        let dropped = requested.len().saturating_sub(MAX_LESSON_PLANNING_EXCERPTS);
        if dropped > 0 {
            eprintln!(
                "lesson evidence exceeded the excerpt budget: {} requested, {MAX_LESSON_PLANNING_EXCERPTS} kept, {dropped} dropped",
                requested.len()
            );
        }
        let record_ids = requested
            .into_iter()
            .take(MAX_LESSON_PLANNING_EXCERPTS)
            .collect::<Vec<_>>();
        self.with_connection(|connection| {
            let attribution = load_attribution(connection)?;
            record_ids
                .iter()
                .map(|record_id| {
                    load_excerpt(connection, record_id, &attribution)?.ok_or_else(|| {
                        format!(
                            "The source selected for this lesson is not in the installed library: {record_id}"
                        )
                    })
                })
                .collect()
        })
    }

    pub fn resolve_figures(&self, record_ids: &[String]) -> Result<Vec<TextbookFigure>> {
        let mut seen = HashSet::new();
        let ordered_ids = record_ids
            .iter()
            .filter(|record_id| seen.insert((*record_id).clone()))
            .collect::<Vec<_>>();
        self.with_connection(|connection| {
            let mut figures = Vec::new();
            for record_id in ordered_ids {
                let mut statement = connection
                    .prepare(
                        "SELECT asset_file_name, source_url, caption, alt_text, sha256,
                                media_type, width_px, height_px, sequence
                         FROM textbook_record_figures
                         WHERE record_id = ?1 ORDER BY sequence",
                    )
                    .map_err(corpus_error)?;
                let record_figures = statement
                    .query_map([record_id], |row| {
                        Ok(TextbookFigure {
                            record_id: record_id.clone(),
                            asset_file_name: row.get(0)?,
                            source_url: row.get(1)?,
                            caption: row.get(2)?,
                            alt_text: row.get(3)?,
                            sha256: row.get(4)?,
                            media_type: row.get(5)?,
                            width_px: row.get(6)?,
                            height_px: row.get(7)?,
                            sequence: row.get(8)?,
                        })
                    })
                    .map_err(corpus_error)?
                    .collect::<std::result::Result<Vec<_>, _>>()
                    .map_err(corpus_error)?;
                figures.extend(record_figures);
            }
            Ok(figures)
        })
    }

    pub fn figure_data_url(&self, asset_file_name: &str, expected_sha256: &str) -> Result<String> {
        if !safe_png_file_name(asset_file_name) {
            return Err("The requested lesson figure is invalid.".to_owned());
        }
        let root = self
            .package_root
            .lock()
            .map_err(|error| error.to_string())?
            .clone()
            .ok_or_else(|| "The installed source library is not ready.".to_owned())?;
        let bytes = fs::read(root.join("figures").join(asset_file_name))
            .map_err(|_| "The requested lesson figure could not be read.".to_owned())?;
        let actual_sha256 = format!("{:x}", Sha256::digest(&bytes));
        if actual_sha256 != expected_sha256 {
            return Err("The requested lesson figure failed its integrity check.".to_owned());
        }
        Ok(format!("data:image/png;base64,{}", BASE64.encode(bytes)))
    }

    #[allow(dead_code)]
    pub fn resolve_subtopic(&self, subtopic_id: &str) -> Result<Vec<TextbookExcerpt>> {
        self.with_connection(|connection| {
            let attribution = load_attribution(connection)?;
            let mut statement = connection
                .prepare(
                    "SELECT record_id FROM subtopic_sources
                     WHERE subtopic_id = ?1 ORDER BY rank LIMIT ?2",
                )
                .map_err(corpus_error)?;
            let record_ids = statement
                .query_map(params![subtopic_id, MAX_SECTION_EXCERPTS as i64], |row| {
                    row.get::<_, String>(0)
                })
                .map_err(corpus_error)?
                .collect::<std::result::Result<Vec<_>, _>>()
                .map_err(corpus_error)?;
            record_ids
                .iter()
                .map(|record_id| {
                    load_excerpt(connection, record_id, &attribution)?.ok_or_else(|| {
                        "The installed source library contains an invalid curriculum link."
                            .to_owned()
                    })
                })
                .collect()
        })
    }

    fn with_connection<T>(&self, operation: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let connection = self.connection.lock().map_err(|error| error.to_string())?;
        let connection = connection
            .as_ref()
            .ok_or_else(|| "The installed source library is not ready.".to_owned())?;
        operation(connection)
    }

    /// Source material for a lesson the teacher wrote themselves, found from
    /// what they typed rather than from a curriculum linkage.
    pub(crate) fn find_source_material(
        &self,
        phrases: &[&str],
        limit: usize,
    ) -> Result<Vec<TextbookExcerpt>> {
        let index = self
            .search_index
            .lock()
            .map_err(|error| error.to_string())?;
        let index = index
            .as_ref()
            .ok_or_else(|| "The installed source library is not ready.".to_owned())?;
        self.with_connection(|connection| {
            let attribution = load_attribution(connection)?;
            super::search::search(index, connection, phrases, limit, &attribution)
        })
    }
}

fn validate_corpus(connection: &Connection) -> Result<()> {
    let integrity = connection
        .query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
        .map_err(corpus_error)?;
    if integrity != "ok" {
        return Err("The installed source library is damaged.".to_owned());
    }
    let package_id = metadata(connection, "package_id")?;
    let format_version = metadata(connection, "format_version")?;
    if package_id != EXPECTED_PACKAGE_ID || format_version != EXPECTED_FORMAT_VERSION {
        return Err("The installed source library is not compatible with this app.".to_owned());
    }
    let expected_records = metadata(connection, "record_count")?
        .parse::<i64>()
        .map_err(|_| "The installed source library has invalid metadata.".to_owned())?;
    let actual_records = connection
        .query_row("SELECT COUNT(*) FROM textbook_records", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(corpus_error)?;
    if expected_records != actual_records || actual_records == 0 {
        return Err("The installed source library is incomplete.".to_owned());
    }
    let expected_figures = metadata(connection, "figure_count")?
        .parse::<i64>()
        .map_err(|_| "The installed source library has invalid metadata.".to_owned())?;
    let actual_figures = connection
        .query_row("SELECT COUNT(*) FROM textbook_record_figures", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(corpus_error)?;
    if expected_figures != actual_figures || actual_figures == 0 {
        return Err("The installed source library is incomplete.".to_owned());
    }
    load_attribution(connection)?;
    Ok(())
}

pub(super) fn load_attribution(connection: &Connection) -> Result<CorpusAttribution> {
    Ok(CorpusAttribution {
        package_id: metadata(connection, "package_id")?,
        title: metadata(connection, "title")?,
        publisher: metadata(connection, "publisher")?,
        source_url: metadata(connection, "source_url")?,
        licence_name: metadata(connection, "licence_name")?,
        licence_url: metadata(connection, "licence_url")?,
        attribution: metadata(connection, "attribution")?,
    })
}

fn metadata(connection: &Connection, key: &str) -> Result<String> {
    connection
        .query_row(
            "SELECT value FROM corpus_metadata WHERE key = ?1",
            [key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(corpus_error)?
        .ok_or_else(|| "The installed source library has incomplete metadata.".to_owned())
}

pub(super) fn load_excerpt(
    connection: &Connection,
    record_id: &str,
    attribution: &CorpusAttribution,
) -> Result<Option<TextbookExcerpt>> {
    connection
        .query_row(
            "SELECT record_id, title,
                    COALESCE(NULLIF(trim(prompt_text), ''), NULLIF(trim(content_text), ''), NULLIF(trim(retrieval_text), ''))
             FROM textbook_records WHERE record_id = ?1",
            [record_id],
            |row| {
                Ok(TextbookExcerpt {
                    record_id: row.get(0)?,
                    title: row.get(1)?,
                    text: remove_markdown_images(&row.get::<_, String>(2)?),
                    attribution: attribution.clone(),
                })
            },
        )
        .optional()
        .map_err(corpus_error)
}

fn remove_markdown_images(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut remaining = value;
    while let Some(start) = remaining.find("![") {
        result.push_str(&remaining[..start]);
        let Some(close_label) = remaining[start + 2..].find("](") else {
            result.push_str(&remaining[start..]);
            return result;
        };
        let url_start = start + 2 + close_label + 2;
        let Some(close_url) = remaining[url_start..].find(')') else {
            result.push_str(&remaining[start..]);
            return result;
        };
        remaining = &remaining[url_start + close_url + 1..];
    }
    result.push_str(remaining);
    result
        .split('\n')
        .fold(String::new(), |mut output, line| {
            if !line.trim().is_empty() || !output.ends_with("\n\n") {
                output.push_str(line);
                output.push('\n');
            }
            output
        })
        .trim()
        .to_owned()
}

fn safe_png_file_name(value: &str) -> bool {
    value.ends_with(".png")
        && !value.is_empty()
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_')
        })
        && !value.contains("..")
        && !value.contains('/')
        && !value.contains('\\')
}

fn corpus_error(_error: rusqlite::Error) -> String {
    "The installed source library could not be read.".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn corpus() -> (tempfile::TempDir, ContentCorpus) {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("corpus.sqlite3");
        let connection = Connection::open(&path).expect("fixture database");
        connection
            .execute_batch(
                "CREATE TABLE corpus_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL) WITHOUT ROWID;
                 CREATE TABLE textbook_records (
                    record_id TEXT PRIMARY KEY NOT NULL,
                    title TEXT NOT NULL,
                    prompt_text TEXT NOT NULL,
                    content_text TEXT NOT NULL,
                    retrieval_text TEXT NOT NULL
                 ) WITHOUT ROWID;
                 CREATE TABLE subtopic_sources (
                    subtopic_id TEXT NOT NULL,
                    record_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    rank INTEGER NOT NULL,
                    PRIMARY KEY (subtopic_id, record_id)
                 ) WITHOUT ROWID;
                 CREATE TABLE textbook_record_figures (
                    record_id TEXT NOT NULL,
                    sequence INTEGER NOT NULL,
                    asset_file_name TEXT NOT NULL,
                    source_url TEXT NOT NULL,
                    caption TEXT NOT NULL,
                    alt_text TEXT NOT NULL,
                    sha256 TEXT NOT NULL,
                    media_type TEXT NOT NULL,
                    width_px INTEGER NOT NULL,
                    height_px INTEGER NOT NULL,
                    PRIMARY KEY (record_id, sequence)
                 ) WITHOUT ROWID;",
            )
            .expect("fixture schema");
        let metadata = [
            ("format_version", "2"),
            ("package_id", EXPECTED_PACKAGE_ID),
            ("title", "Siyavula Mathematics JSS 1"),
            ("publisher", "Siyavula"),
            ("source_url", "https://ng.siyavula.com/read"),
            ("licence_name", "Creative Commons Attribution 3.0 Unported"),
            (
                "licence_url",
                "https://creativecommons.org/licenses/by/3.0/",
            ),
            ("attribution", "Siyavula Mathematics JSS 1, CC BY 3.0."),
            ("record_count", "5"),
            ("figure_count", "1"),
        ];
        connection
            .execute_batch("BEGIN IMMEDIATE")
            .expect("begin fixture");
        for (key, value) in metadata {
            connection
                .execute(
                    "INSERT INTO corpus_metadata (key, value) VALUES (?1, ?2)",
                    params![key, value],
                )
                .expect("metadata");
        }
        for (record_id, prompt, content, retrieval) in [
            (
                "record-prompt",
                "prompt passage",
                "content passage\n\n![](https://example.invalid/model-image.png)",
                "retrieval passage",
            ),
            ("record-content", "", "content passage", "retrieval passage"),
            ("record-retrieval", "", "", "retrieval passage"),
            ("record-four", "four", "", ""),
            ("record-five", "five", "", ""),
        ] {
            connection
                .execute(
                    "INSERT INTO textbook_records (record_id, title, prompt_text, content_text, retrieval_text)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![record_id, format!("Title {record_id}"), prompt, content, retrieval],
                )
                .expect("record");
        }
        for (rank, record_id) in ["record-content", "record-prompt", "record-retrieval"]
            .into_iter()
            .enumerate()
        {
            connection
                .execute(
                    "INSERT INTO subtopic_sources (subtopic_id, record_id, role, rank)
                     VALUES ('fractions', ?1, 'instruction', ?2)",
                    params![record_id, rank as i64 + 1],
                )
                .expect("subtopic source");
        }
        let figure_bytes = b"trusted figure";
        let figure_sha256 = format!("{:x}", Sha256::digest(figure_bytes));
        connection
            .execute(
                "INSERT INTO textbook_record_figures (
                    record_id, sequence, asset_file_name, source_url, caption, alt_text,
                    sha256, media_type, width_px, height_px
                 ) VALUES ('record-content', 1, 'record-content.png',
                    'https://example.invalid/record-content.png', 'A fraction model.',
                    'A fraction model.', ?1, 'image/png', 320, 180)",
                [figure_sha256],
            )
            .expect("figure metadata");
        connection.execute_batch("COMMIT").expect("commit fixture");
        drop(connection);
        let figure_directory = directory.path().join("figures");
        fs::create_dir(&figure_directory).expect("figure directory");
        fs::write(figure_directory.join("record-content.png"), figure_bytes).expect("figure file");
        let corpus = ContentCorpus::default();
        corpus.init_at(&path).expect("open fixture");
        (directory, corpus)
    }

    #[test]
    fn resolves_record_figures_and_reads_only_hash_checked_package_assets() {
        let (_directory, corpus) = corpus();
        let figures = corpus
            .resolve_figures(&["record-content".to_owned()])
            .expect("figures");

        assert_eq!(figures.len(), 1);
        assert_eq!(figures[0].caption, "A fraction model.");
        assert_eq!(figures[0].width_px, 320);
        let data_url = corpus
            .figure_data_url(&figures[0].asset_file_name, &figures[0].sha256)
            .expect("figure data");
        assert!(data_url.starts_with("data:image/png;base64,"));
        assert!(corpus
            .figure_data_url("../record-content.png", &figures[0].sha256)
            .is_err());
        assert!(corpus
            .figure_data_url(&figures[0].asset_file_name, "0")
            .is_err());
    }

    #[test]
    fn resolves_curated_subtopic_sources_in_rank_order() {
        let (_directory, corpus) = corpus();

        let excerpts = corpus.resolve_subtopic("fractions").expect("subtopic");

        assert_eq!(
            excerpts
                .iter()
                .map(|excerpt| excerpt.record_id.as_str())
                .collect::<Vec<_>>(),
            vec!["record-content", "record-prompt", "record-retrieval"]
        );
    }
}
