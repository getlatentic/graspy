-- A student's note kept beside a lesson, held as one document the way a
-- hand-authored lesson's content is (lesson_authored_content). The paragraphs
-- are a JSON array of the note's lines; the lesson version the note was written
-- from is recorded so a note can be told apart from a lesson that has since
-- changed. One note per lesson, cleared when the lesson is deleted.
CREATE TABLE lesson_notes (
    lesson_id TEXT PRIMARY KEY NOT NULL,
    paragraphs TEXT NOT NULL CHECK (json_valid(paragraphs)),
    written_from_version INTEGER NOT NULL,
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);
