-- Give a course back the alignments it was installed without.
--
-- A release installed knowledge components while writing none of the rows
-- saying which learning goals they serve. Nothing failed at the time. It failed
-- when a teacher tried to prepare a lesson: load_scope_knowledge finds no
-- teachable knowledge for the goal and refuses the lesson, and in the library
-- this was found in, every one of the 98 goals reachable from the scheme of work
-- was affected.
--
-- A later revision of the same package installed correctly beside it, holding
-- the same component codes and the same goal codes. That is what the alignments
-- are recovered from — the same publisher, edition and course, so a component
-- serves the same goals in both.
--
-- Only a course holding no alignments at all is repaired. A course with some is
-- a different situation than the one this addresses, and is left alone.
--
-- Installed alignments are immutable against UPDATE and DELETE. This inserts
-- rows that were never written, which is neither.

INSERT INTO knowledge_component_objectives (
    knowledge_component_id, atomic_objective_id, curriculum_course_id
)
SELECT unaligned_component.id,
       unaligned_objective.id,
       unaligned_course.id
FROM knowledge_component_objectives aligned_link
JOIN knowledge_components aligned_component
  ON aligned_component.id = aligned_link.knowledge_component_id
JOIN atomic_learning_objectives aligned_objective
  ON aligned_objective.id = aligned_link.atomic_objective_id
JOIN curriculum_courses aligned_course
  ON aligned_course.id = aligned_component.curriculum_course_id
JOIN curriculum_frameworks aligned_framework
  ON aligned_framework.id = aligned_course.framework_id
JOIN curriculum_courses unaligned_course
  ON unaligned_course.course_key = aligned_course.course_key
 AND unaligned_course.id <> aligned_course.id
JOIN curriculum_frameworks unaligned_framework
  ON unaligned_framework.id = unaligned_course.framework_id
 AND unaligned_framework.normalized_name = aligned_framework.normalized_name
 AND unaligned_framework.normalized_authority = aligned_framework.normalized_authority
 AND unaligned_framework.version = aligned_framework.version
JOIN knowledge_components unaligned_component
  ON unaligned_component.curriculum_course_id = unaligned_course.id
 AND unaligned_component.code = aligned_component.code
JOIN atomic_learning_objectives unaligned_objective
  ON unaligned_objective.curriculum_course_id = unaligned_course.id
 AND unaligned_objective.source_code = aligned_objective.source_code
WHERE NOT EXISTS (
    SELECT 1 FROM knowledge_component_objectives present
    WHERE present.curriculum_course_id = unaligned_course.id
);
