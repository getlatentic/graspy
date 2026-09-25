DROP TRIGGER curriculum_packages_immutable_update;
DROP TRIGGER curriculum_packages_immutable_delete;
DROP TRIGGER installed_curriculum_frameworks_immutable_update;
DROP TRIGGER installed_curriculum_frameworks_immutable_delete;
DROP TRIGGER scheme_template_packages_immutable_update;
DROP TRIGGER scheme_template_packages_immutable_delete;

CREATE TABLE curriculum_packages_v18 (
    id TEXT PRIMARY KEY NOT NULL,
    package_key TEXT NOT NULL,
    title TEXT NOT NULL,
    publisher TEXT NOT NULL,
    normalized_publisher TEXT NOT NULL,
    jurisdiction_id TEXT NOT NULL,
    edition TEXT NOT NULL,
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
    UNIQUE (package_key, edition),
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

INSERT INTO curriculum_packages_v18 (
    id, package_key, title, publisher, normalized_publisher, jurisdiction_id,
    edition, effective_from, effective_to, source_uri, source_sha256,
    licence_id, licence_name, licence_url, attribution, modification_notice,
    payload_sha256, trust, signer_key_id, payload, installed_at, dataset_sha256,
    rights_kind, rights_name, rights_statement, rights_url
)
SELECT
    id, package_key, title, publisher, normalized_publisher, jurisdiction_id,
    edition, effective_from, effective_to, source_uri, source_sha256,
    licence_id, licence_name, licence_url, attribution, modification_notice,
    payload_sha256, trust, signer_key_id, payload, installed_at, dataset_sha256,
    'licence', licence_name, attribution, licence_url
FROM curriculum_packages;

DROP TABLE curriculum_packages;
ALTER TABLE curriculum_packages_v18 RENAME TO curriculum_packages;

ALTER TABLE curriculum_frameworks ADD COLUMN rights_kind TEXT CHECK (
    rights_kind IN ('licence', 'official_text', 'public_domain', 'permission')
);
ALTER TABLE curriculum_frameworks ADD COLUMN rights_name TEXT;
ALTER TABLE curriculum_frameworks ADD COLUMN rights_statement TEXT;
ALTER TABLE curriculum_frameworks ADD COLUMN rights_url TEXT;

UPDATE curriculum_frameworks
SET rights_kind = 'licence',
    rights_name = licence_name,
    rights_statement = attribution,
    rights_url = licence_url
WHERE package_id IS NOT NULL;

ALTER TABLE scheme_template_packages ADD COLUMN rights_kind TEXT CHECK (
    rights_kind IN ('licence', 'official_text', 'public_domain', 'permission')
);
ALTER TABLE scheme_template_packages ADD COLUMN rights_name TEXT;
ALTER TABLE scheme_template_packages ADD COLUMN rights_statement TEXT;
ALTER TABLE scheme_template_packages ADD COLUMN rights_url TEXT;

UPDATE scheme_template_packages
SET rights_kind = 'licence',
    rights_name = licence_name,
    rights_statement = attribution,
    rights_url = licence_url
WHERE licence_id IS NOT NULL;

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

CREATE TRIGGER scheme_template_packages_immutable_update
BEFORE UPDATE ON scheme_template_packages
BEGIN
    SELECT RAISE(ABORT, 'installed scheme packages are immutable');
END;

CREATE TRIGGER scheme_template_packages_immutable_delete
BEFORE DELETE ON scheme_template_packages
BEGIN
    SELECT RAISE(ABORT, 'installed scheme packages are immutable');
END;

