CREATE TABLE lesson_material_figures (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    asset_file_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    caption TEXT NOT NULL CHECK (length(trim(caption)) > 0),
    alt_text TEXT NOT NULL CHECK (length(trim(alt_text)) > 0),
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    media_type TEXT NOT NULL CHECK (media_type = 'image/png'),
    width_px INTEGER NOT NULL CHECK (width_px > 0),
    height_px INTEGER NOT NULL CHECK (height_px > 0),
    UNIQUE (run_id, sequence),
    UNIQUE (run_id, source_id, asset_file_name),
    FOREIGN KEY (run_id) REFERENCES lesson_material_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES lesson_material_sources(id) ON DELETE RESTRICT
);
