-- A lesson's teaching pack kept beside it: the slides a class is taught from and
-- a quick check of a few questions with their answers, both written from the
-- lesson plan. Slides and quiz are JSON arrays; the lesson version the pack was
-- written from is recorded so a pack can be told apart from a lesson that has
-- since changed. One pack per lesson, cleared when the lesson is deleted.
CREATE TABLE lesson_packs (
    lesson_id TEXT PRIMARY KEY NOT NULL,
    slides TEXT NOT NULL CHECK (json_valid(slides)),
    quiz TEXT NOT NULL CHECK (json_valid(quiz)),
    written_from_version INTEGER NOT NULL,
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);
