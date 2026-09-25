CREATE TABLE curriculum_packages (
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
    licence_id TEXT NOT NULL,
    licence_name TEXT NOT NULL,
    licence_url TEXT NOT NULL,
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
    )
);

ALTER TABLE curriculum_frameworks ADD COLUMN package_id TEXT
    REFERENCES curriculum_packages(id) ON DELETE RESTRICT;
ALTER TABLE curriculum_frameworks ADD COLUMN modification_notice TEXT;

CREATE UNIQUE INDEX curriculum_frameworks_package_identity
ON curriculum_frameworks (package_id)
WHERE package_id IS NOT NULL;

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

CREATE TRIGGER installed_curriculum_nodes_immutable_update
BEFORE UPDATE ON curriculum_nodes
BEGIN
    SELECT RAISE(ABORT, 'installed curriculum nodes are immutable');
END;

CREATE TRIGGER installed_curriculum_nodes_immutable_delete
BEFORE DELETE ON curriculum_nodes
BEGIN
    SELECT RAISE(ABORT, 'installed curriculum nodes are immutable');
END;

CREATE TRIGGER installed_atomic_objectives_immutable_update
BEFORE UPDATE ON atomic_learning_objectives
BEGIN
    SELECT RAISE(ABORT, 'installed curriculum objectives are immutable');
END;

CREATE TRIGGER installed_atomic_objectives_immutable_delete
BEFORE DELETE ON atomic_learning_objectives
BEGIN
    SELECT RAISE(ABORT, 'installed curriculum objectives are immutable');
END;

CREATE TRIGGER installed_knowledge_components_immutable_update
BEFORE UPDATE ON knowledge_components
BEGIN
    SELECT RAISE(ABORT, 'installed knowledge components are immutable');
END;

CREATE TRIGGER installed_knowledge_components_immutable_delete
BEFORE DELETE ON knowledge_components
BEGIN
    SELECT RAISE(ABORT, 'installed knowledge components are immutable');
END;

CREATE TRIGGER installed_knowledge_prerequisites_immutable_update
BEFORE UPDATE ON knowledge_component_prerequisites
BEGIN
    SELECT RAISE(ABORT, 'installed knowledge prerequisites are immutable');
END;

CREATE TRIGGER installed_knowledge_prerequisites_immutable_delete
BEFORE DELETE ON knowledge_component_prerequisites
BEGIN
    SELECT RAISE(ABORT, 'installed knowledge prerequisites are immutable');
END;
