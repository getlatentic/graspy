ALTER TABLE curriculum_packages
ADD COLUMN origin TEXT NOT NULL DEFAULT 'imported'
CHECK (origin IN ('bundled', 'imported'));
