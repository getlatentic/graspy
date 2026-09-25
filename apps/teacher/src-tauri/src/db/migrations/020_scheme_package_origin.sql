ALTER TABLE scheme_template_packages
ADD COLUMN origin TEXT NOT NULL DEFAULT 'imported'
CHECK (origin IN ('bundled', 'imported'));
