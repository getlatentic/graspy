-- Which model a teacher chose to write lessons with.
--
-- One row for the machine, not per workspace: there is one engine holding one
-- model in memory, so the choice belongs to the installation. No foreign key —
-- the catalogue of models lives in the program, not in a table, and a model
-- withdrawn in a later release must leave the app choosing its default rather
-- than failing to start.
CREATE TABLE selected_lesson_model (
    singleton_id INTEGER PRIMARY KEY NOT NULL DEFAULT 1 CHECK (singleton_id = 1),
    model_id TEXT NOT NULL,
    selected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
