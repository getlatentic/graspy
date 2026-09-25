-- A hand-authored lesson's content lives beside its lesson row as one document,
-- the way a generated lesson's granular record does. It carries no curriculum or
-- evidence provenance — a teacher writing by hand has none — so it is a single
-- validated JSON document rather than the granular provenance tables. A teacher
-- saves it while still writing, so the words may be incomplete; only that the
-- document is well-formed JSON is enforced here.
CREATE TABLE lesson_authored_content (
    lesson_id TEXT PRIMARY KEY NOT NULL,
    content TEXT NOT NULL CHECK (json_valid(content)),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);
