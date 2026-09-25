CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

CREATE TABLE academic_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    start_year INTEGER NOT NULL CHECK (start_year BETWEEN 1900 AND 9998),
    end_year INTEGER NOT NULL CHECK (end_year = start_year + 1),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'archived')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (start_year, end_year),
    UNIQUE (id, start_year)
);

CREATE TABLE academic_periods (
    id TEXT PRIMARY KEY NOT NULL,
    academic_session_id TEXT NOT NULL,
    term_number INTEGER NOT NULL CHECK (term_number BETWEEN 1 AND 3),
    UNIQUE (academic_session_id, term_number),
    UNIQUE (id, academic_session_id),
    FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT
);

CREATE TABLE subjects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE,
    is_catalog INTEGER NOT NULL DEFAULT 0 CHECK (is_catalog IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE grade_levels (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL UNIQUE
);

CREATE TABLE teaching_assignments (
    id TEXT PRIMARY KEY NOT NULL,
    academic_session_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    grade_level_id TEXT NOT NULL,
    class_section TEXT,
    class_section_key TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (academic_session_id, subject_id, grade_level_id, class_section_key),
    UNIQUE (id, academic_session_id),
    FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
    FOREIGN KEY (grade_level_id) REFERENCES grade_levels(id) ON DELETE RESTRICT
);

CREATE TABLE workspace_preferences (
    singleton_id INTEGER PRIMARY KEY NOT NULL DEFAULT 1 CHECK (singleton_id = 1),
    active_academic_session_id TEXT NOT NULL,
    active_academic_period_id TEXT NOT NULL,
    active_teaching_assignment_id TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (active_academic_period_id, active_academic_session_id)
        REFERENCES academic_periods(id, academic_session_id) ON DELETE RESTRICT,
    FOREIGN KEY (active_teaching_assignment_id, active_academic_session_id)
        REFERENCES teaching_assignments(id, academic_session_id) ON DELETE RESTRICT
);

INSERT INTO grade_levels (id, code, display_name, sort_order) VALUES
    ('grade-nursery-1', 'NURSERY1', 'Nursery 1', 10),
    ('grade-nursery-2', 'NURSERY2', 'Nursery 2', 20),
    ('grade-primary-1', 'PRIMARY1', 'Primary 1', 30),
    ('grade-primary-2', 'PRIMARY2', 'Primary 2', 40),
    ('grade-primary-3', 'PRIMARY3', 'Primary 3', 50),
    ('grade-primary-4', 'PRIMARY4', 'Primary 4', 60),
    ('grade-primary-5', 'PRIMARY5', 'Primary 5', 70),
    ('grade-primary-6', 'PRIMARY6', 'Primary 6', 80),
    ('grade-jss-1', 'JSS1', 'JSS 1', 90),
    ('grade-jss-2', 'JSS2', 'JSS 2', 100),
    ('grade-jss-3', 'JSS3', 'JSS 3', 110),
    ('grade-sss-1', 'SSS1', 'SSS 1', 120),
    ('grade-sss-2', 'SSS2', 'SSS 2', 130),
    ('grade-sss-3', 'SSS3', 'SSS 3', 140);

INSERT INTO subjects (id, name, normalized_name, is_catalog) VALUES
    ('subject-mathematics', 'Mathematics', 'mathematics', 1),
    ('subject-english-language', 'English Language', 'english language', 1),
    ('subject-basic-science', 'Basic Science', 'basic science', 1),
    ('subject-social-studies', 'Social Studies', 'social studies', 1),
    ('subject-civic-education', 'Civic Education', 'civic education', 1),
    ('subject-computer-studies', 'Computer Studies', 'computer studies', 1),
    ('subject-agricultural-science', 'Agricultural Science', 'agricultural science', 1),
    ('subject-business-studies', 'Business Studies', 'business studies', 1),
    ('subject-basic-technology', 'Basic Technology', 'basic technology', 1),
    ('subject-physical-health-education', 'Physical and Health Education', 'physical and health education', 1),
    ('subject-french', 'French', 'french', 1),
    ('subject-religious-studies', 'Religious Studies', 'religious studies', 1),
    ('subject-biology', 'Biology', 'biology', 1),
    ('subject-chemistry', 'Chemistry', 'chemistry', 1),
    ('subject-physics', 'Physics', 'physics', 1),
    ('subject-economics', 'Economics', 'economics', 1),
    ('subject-geography', 'Geography', 'geography', 1),
    ('subject-government', 'Government', 'government', 1),
    ('subject-literature-english', 'Literature in English', 'literature in english', 1),
    ('subject-further-mathematics', 'Further Mathematics', 'further mathematics', 1);
