//! Finding source material for a lesson the teacher wrote themselves.
//!
//! The library on disk reaches its records through curriculum subtopic ids, so a
//! teacher who has not installed a curriculum cannot get to any of it. This
//! builds a full-text index over the same records at start-up, in memory,
//! leaving the installed library untouched and read-only.

use rusqlite::{params, Connection};

use super::domain::TextbookExcerpt;

type Result<T> = std::result::Result<T, String>;

/// Words that say nothing about what a lesson is about.
const IGNORED_TERMS: &[&str] = &[
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "for", "from", "how", "in", "into",
    "is", "it", "of", "on", "or", "that", "the", "their", "them", "then", "there", "these", "this",
    "to", "use", "using", "was", "were", "what", "when", "which", "why", "will", "with",
];

pub(super) fn build_index(source: &Connection) -> Result<Connection> {
    let index = Connection::open_in_memory()
        .map_err(|_| "The source library could not be prepared for searching.".to_owned())?;
    index
        .execute_batch(
            "CREATE VIRTUAL TABLE searchable_records USING fts5(
                 record_id UNINDEXED,
                 title,
                 body
             );",
        )
        .map_err(|_| "The source library could not be prepared for searching.".to_owned())?;

    let mut records = source
        .prepare(
            "SELECT record_id, title,
                    COALESCE(NULLIF(TRIM(retrieval_text), ''), content_text)
             FROM textbook_records",
        )
        .map_err(read_failed)?;
    let rows = records
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(read_failed)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(read_failed)?;

    let mut insert = index
        .prepare(
            "INSERT INTO searchable_records (record_id, title, body)
             VALUES (?1, ?2, ?3)",
        )
        .map_err(read_failed)?;
    for (record_id, title, body) in rows {
        insert
            .execute(params![record_id, title, body])
            .map_err(read_failed)?;
    }
    drop(insert);
    drop(records);
    Ok(index)
}

/// Turns what a teacher wrote into a query the index understands. Terms are
/// OR-ed so a lesson still finds material when only part of its wording matches,
/// and ranking decides which records are worth offering.
pub(super) fn to_query(phrases: &[&str]) -> Option<String> {
    let mut terms: Vec<String> = Vec::new();
    for phrase in phrases {
        for word in phrase.split(|character: char| !character.is_alphanumeric()) {
            let word = word.trim().to_lowercase();
            if word.chars().count() < 3 || IGNORED_TERMS.contains(&word.as_str()) {
                continue;
            }
            if !terms.contains(&word) {
                terms.push(word);
            }
        }
    }
    if terms.is_empty() {
        return None;
    }
    Some(
        terms
            .iter()
            .map(|term| format!("\"{term}\""))
            .collect::<Vec<_>>()
            .join(" OR "),
    )
}

pub(super) fn search(
    index: &Connection,
    source: &Connection,
    phrases: &[&str],
    limit: usize,
    attribution: &super::domain::CorpusAttribution,
) -> Result<Vec<TextbookExcerpt>> {
    let Some(query) = to_query(phrases) else {
        return Ok(vec![]);
    };
    let mut statement = index
        .prepare(
            "SELECT record_id FROM searchable_records
             WHERE searchable_records MATCH ?1
             ORDER BY bm25(searchable_records, 0.0, 4.0, 1.0)
             LIMIT ?2",
        )
        .map_err(read_failed)?;
    let record_ids = statement
        .query_map(params![query, limit as i64], |row| row.get::<_, String>(0))
        .map_err(read_failed)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(read_failed)?;

    let mut excerpts = Vec::with_capacity(record_ids.len());
    for record_id in record_ids {
        if let Some(excerpt) = super::repository::load_excerpt(source, &record_id, attribution)? {
            excerpts.push(excerpt);
        }
    }
    Ok(excerpts)
}

fn read_failed(_error: rusqlite::Error) -> String {
    "The source library could not be searched.".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_words_that_say_nothing_about_the_lesson() {
        assert_eq!(
            to_query(&["The lesson is about", "a"]),
            Some("\"lesson\" OR \"about\"".to_owned())
        );
    }

    #[test]
    fn has_nothing_to_search_for_when_every_word_is_common() {
        assert_eq!(to_query(&["the and of", "is it"]), None);
    }

    #[test]
    fn asks_for_each_distinct_word_once() {
        assert_eq!(
            to_query(&["Fractions and fractions", "FRACTIONS"]),
            Some("\"fractions\"".to_owned()),
        );
    }
}

#[cfg(test)]
mod bundled_corpus_tests {
    use super::*;
    use std::path::Path;
    use std::time::Instant;

    fn bundled() -> Option<Connection> {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/content/siyavula-jss1-mathematics-v1/corpus.sqlite3");
        Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).ok()
    }

    #[test]
    fn finds_material_for_a_lesson_written_without_a_curriculum() {
        let Some(source) = bundled() else { return };
        let started = Instant::now();
        let index = build_index(&source).expect("index over the installed library");
        let build = started.elapsed();

        let started = Instant::now();
        let mut statement = index
            .prepare(
                "SELECT record_id, title FROM searchable_records
                 WHERE searchable_records MATCH ?1
                 ORDER BY bm25(searchable_records, 0.0, 4.0, 1.0) LIMIT 5",
            )
            .expect("query");
        let query = to_query(&[
            "Equivalent fractions",
            "Compare fractions using visual models",
        ])
        .expect("a query");
        let hits = statement
            .query_map(params![query], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .expect("search")
            .collect::<rusqlite::Result<Vec<_>>>()
            .expect("rows");
        let search = started.elapsed();

        eprintln!("index built in {build:?}, searched in {search:?}");
        for (record_id, title) in &hits {
            eprintln!("  {record_id}  {title}");
        }
        assert!(
            !hits.is_empty(),
            "a lesson about fractions should find material"
        );
        assert!(
            hits.iter()
                .any(|(_, title)| title.to_lowercase().contains("fraction")),
            "the best matches should be about fractions, got {hits:?}",
        );
    }
}
