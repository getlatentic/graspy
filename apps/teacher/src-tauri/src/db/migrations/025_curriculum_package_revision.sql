-- A curriculum package is identified by the publisher's edition and by which
-- graspy conversion of it this is.
--
-- Identity was UNIQUE (package_key, edition), where edition carries only the
-- publisher's edition — already pinned by source_uri, source_sha256 and
-- dataset_sha256. It left no way to express an improved conversion of an
-- unchanged source, so a better conversion could never reach an installation
-- that already held the earlier one. package_revision carries that, and keeps
-- edition meaning exactly what the publisher published.
--
-- Existing rows are revision 1: they are the first conversion graspy shipped.

CREATE TABLE curriculum_packages_v25 (
    id TEXT PRIMARY KEY NOT NULL,
    package_key TEXT NOT NULL,
    title TEXT NOT NULL,
    publisher TEXT NOT NULL,
    normalized_publisher TEXT NOT NULL,
    jurisdiction_id TEXT NOT NULL,
    edition TEXT NOT NULL,
    package_revision INTEGER NOT NULL DEFAULT 1 CHECK (package_revision >= 1),
    effective_from TEXT,
    effective_to TEXT,
    source_uri TEXT NOT NULL,
    source_sha256 TEXT NOT NULL CHECK (
        length(source_sha256) = 64
        AND source_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
    licence_id TEXT,
    licence_name TEXT,
    licence_url TEXT,
    attribution TEXT NOT NULL,
    modification_notice TEXT NOT NULL,
    payload_sha256 TEXT NOT NULL UNIQUE CHECK (
        length(payload_sha256) = 64
        AND payload_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
    trust TEXT NOT NULL CHECK (trust IN ('verified', 'school')),
    signer_key_id TEXT,
    payload TEXT NOT NULL,
    installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dataset_sha256 TEXT,
    rights_kind TEXT NOT NULL CHECK (
        rights_kind IN ('licence', 'official_text', 'public_domain', 'permission')
    ),
    rights_name TEXT NOT NULL,
    rights_statement TEXT NOT NULL,
    rights_url TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT 'imported' CHECK (origin IN ('bundled', 'imported')),
    UNIQUE (package_key, edition, package_revision),
    FOREIGN KEY (jurisdiction_id) REFERENCES jurisdictions(id) ON DELETE RESTRICT,
    CHECK (
        effective_from IS NULL
        OR effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
    CHECK (
        effective_to IS NULL
        OR effective_to GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
    CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from),
    CHECK (
        (trust = 'verified' AND signer_key_id IS NOT NULL)
        OR (trust = 'school' AND signer_key_id IS NULL)
    ),
    CHECK (
        (rights_kind = 'licence'
         AND licence_id IS NOT NULL
         AND licence_name IS NOT NULL
         AND licence_url IS NOT NULL)
        OR (rights_kind <> 'licence'
            AND licence_id IS NULL
            AND licence_name IS NULL
            AND licence_url IS NULL)
    )
);

INSERT INTO curriculum_packages_v25 (
    id, package_key, title, publisher, normalized_publisher, jurisdiction_id,
    edition, package_revision, effective_from, effective_to, source_uri, source_sha256,
    licence_id, licence_name, licence_url, attribution, modification_notice,
    payload_sha256, trust, signer_key_id, payload, installed_at, dataset_sha256,
    rights_kind, rights_name, rights_statement, rights_url, origin
)
SELECT
    id, package_key, title, publisher, normalized_publisher, jurisdiction_id,
    edition, 1, effective_from, effective_to, source_uri, source_sha256,
    licence_id, licence_name, licence_url, attribution, modification_notice,
    payload_sha256, trust, signer_key_id, payload, installed_at, dataset_sha256,
    rights_kind, rights_name, rights_statement, rights_url, origin
FROM curriculum_packages;

DROP TABLE curriculum_packages;
ALTER TABLE curriculum_packages_v25 RENAME TO curriculum_packages;

-- Dropping the table dropped its immutability triggers. A lesson's curriculum
-- must not change under it, so they are restored with the table.
CREATE TRIGGER curriculum_packages_immutable_update
BEFORE UPDATE ON curriculum_packages
BEGIN
    SELECT RAISE(ABORT, 'installed curriculum packages are immutable');
END;

CREATE TRIGGER curriculum_packages_immutable_delete
BEFORE DELETE ON curriculum_packages
BEGIN
    SELECT RAISE(ABORT, 'installed curriculum packages are immutable');
END;

-- A framework installed from a package took its version from the publisher's
-- edition, so UNIQUE (normalized_name, normalized_authority, version) made two
-- conversions of one edition collide before the new package_revision could tell
-- them apart. A package-backed framework is already identified one-per-package
-- by curriculum_frameworks_package_identity, so that uniqueness is what governs
-- it. The name-and-version rule is what keeps duplicate teacher-authored
-- frameworks out, and it still applies to every framework that has no package.

-- The course immutability triggers read curriculum_frameworks in their WHEN
-- clause, so they are dropped before the table goes and restored with it.
DROP TRIGGER installed_curriculum_courses_immutable_update;
DROP TRIGGER installed_curriculum_courses_immutable_delete;

CREATE TABLE curriculum_frameworks_v25 (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    authority TEXT NOT NULL,
    normalized_authority TEXT NOT NULL,
    jurisdiction TEXT NOT NULL,
    version TEXT NOT NULL,
    source_uri TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    jurisdiction_id TEXT REFERENCES jurisdictions(id) ON DELETE RESTRICT,
    effective_from TEXT,
    effective_to TEXT,
    source_sha256 TEXT,
    licence_id TEXT,
    licence_name TEXT,
    licence_url TEXT,
    attribution TEXT,
    trust TEXT NOT NULL DEFAULT 'school' CHECK (trust IN ('verified', 'school')),
    package_id TEXT REFERENCES curriculum_packages(id) ON DELETE RESTRICT,
    modification_notice TEXT,
    rights_kind TEXT CHECK (
        rights_kind IN ('licence', 'official_text', 'public_domain', 'permission')
    ),
    rights_name TEXT,
    rights_statement TEXT,
    rights_url TEXT
);

INSERT INTO curriculum_frameworks_v25 (
    id, name, normalized_name, authority, normalized_authority, jurisdiction,
    version, source_uri, status, created_at, updated_at, jurisdiction_id,
    effective_from, effective_to, source_sha256, licence_id, licence_name,
    licence_url, attribution, trust, package_id, modification_notice,
    rights_kind, rights_name, rights_statement, rights_url
)
SELECT
    id, name, normalized_name, authority, normalized_authority, jurisdiction,
    version, source_uri, status, created_at, updated_at, jurisdiction_id,
    effective_from, effective_to, source_sha256, licence_id, licence_name,
    licence_url, attribution, trust, package_id, modification_notice,
    rights_kind, rights_name, rights_statement, rights_url
FROM curriculum_frameworks;

DROP TABLE curriculum_frameworks;
ALTER TABLE curriculum_frameworks_v25 RENAME TO curriculum_frameworks;

CREATE UNIQUE INDEX curriculum_frameworks_package_identity
ON curriculum_frameworks (package_id)
WHERE package_id IS NOT NULL;

CREATE UNIQUE INDEX curriculum_frameworks_authored_identity
ON curriculum_frameworks (normalized_name, normalized_authority, version)
WHERE package_id IS NULL;

CREATE TRIGGER installed_curriculum_frameworks_immutable_update
BEFORE UPDATE ON curriculum_frameworks
WHEN OLD.package_id IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'installed curriculum frameworks are immutable');
END;

CREATE TRIGGER installed_curriculum_frameworks_immutable_delete
BEFORE DELETE ON curriculum_frameworks
WHEN OLD.package_id IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'installed curriculum frameworks are immutable');
END;

CREATE TRIGGER installed_curriculum_courses_immutable_update
BEFORE UPDATE ON curriculum_courses
WHEN EXISTS (
    SELECT 1 FROM curriculum_frameworks
    WHERE curriculum_frameworks.id = OLD.framework_id
      AND curriculum_frameworks.package_id IS NOT NULL
)
BEGIN
    SELECT RAISE(ABORT, 'installed curriculum courses are immutable');
END;

CREATE TRIGGER installed_curriculum_courses_immutable_delete
BEFORE DELETE ON curriculum_courses
WHEN EXISTS (
    SELECT 1 FROM curriculum_frameworks
    WHERE curriculum_frameworks.id = OLD.framework_id
      AND curriculum_frameworks.package_id IS NOT NULL
)
BEGIN
    SELECT RAISE(ABORT, 'installed curriculum courses are immutable');
END;
