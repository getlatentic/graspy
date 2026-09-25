-- Give a course back the knowledge types it was installed without.
--
-- The same release that wrote knowledge components with no alignments also
-- wrote them with no knowledge type. Migration 028 restored the alignments, so
-- a lesson from the scheme of work now reaches its knowledge and fails one step
-- later instead: "A selected knowledge component has no supported teaching
-- type." Every one of the 76 components reachable from the scheme of work was
-- affected.
--
-- 028 was verified by counting goals that could reach knowledge, which measured
-- the alignments it had just written and nothing else. This time every column
-- of both tables was compared between the two revisions, and knowledge_type is
-- the only remaining difference.
--
-- Recovered from a complete revision of the same package, edition and course,
-- matched on component code, exactly as the alignments were.
--
-- Installed knowledge is immutable so a lesson cannot change under a teacher.
-- Filling a column that was never written is not a change to what the component
-- says, so the trigger is dropped and restored around it, as migration 025 did
-- for the curriculum family and 027 for confirmed version steps.

DROP TRIGGER installed_knowledge_components_immutable_update;

UPDATE knowledge_components
SET knowledge_type = (
    SELECT complete.knowledge_type
    FROM knowledge_components complete
    JOIN curriculum_courses complete_course
      ON complete_course.id = complete.curriculum_course_id
    JOIN curriculum_frameworks complete_framework
      ON complete_framework.id = complete_course.framework_id
    JOIN curriculum_courses incomplete_course
      ON incomplete_course.id = knowledge_components.curriculum_course_id
    JOIN curriculum_frameworks incomplete_framework
      ON incomplete_framework.id = incomplete_course.framework_id
     AND incomplete_framework.normalized_name = complete_framework.normalized_name
     AND incomplete_framework.normalized_authority = complete_framework.normalized_authority
     AND incomplete_framework.version = complete_framework.version
    WHERE complete.code = knowledge_components.code
      AND complete_course.course_key = incomplete_course.course_key
      AND complete.curriculum_course_id <> knowledge_components.curriculum_course_id
      AND complete.knowledge_type IS NOT NULL
    LIMIT 1
)
WHERE knowledge_type IS NULL;

CREATE TRIGGER installed_knowledge_components_immutable_update
BEFORE UPDATE ON knowledge_components
BEGIN
    SELECT RAISE(ABORT, 'installed knowledge components are immutable');
END;
