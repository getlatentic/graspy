-- Remove source filenames from the materials a teacher is told to bring.
--
-- reject_source_artifact_material refuses these at generation, so lessons made
-- since then are clean. Lessons written before it still list things like
-- "ebw-jss1-01-007.png" under Materials, which is a source file graspy drew the
-- lesson from and not a chart, a number card or a worksheet. A teacher reading
-- that sees an internal identifier where a classroom aid should be.
--
-- Only entries the generator would now refuse are removed, and every real aid
-- beside them is kept. A list that held nothing else becomes empty, which is
-- the truth: that lesson never named a material a teacher could carry.
--
-- differentiated_material_sections.source_materials_snapshot is deliberately
-- untouched. It records the sources a lesson was built from, where a filename
-- is the correct content.

UPDATE lessons SET materials = (
  SELECT COALESCE(json_group_array(value), json('[]'))
  FROM json_each(lessons.materials)
  WHERE lower(value) NOT LIKE '%.png' AND lower(value) NOT LIKE '%.jpg'
    AND lower(value) NOT LIKE '%.jpeg' AND lower(value) NOT LIKE '%.svg'
    AND lower(value) NOT LIKE '%.gif' AND lower(value) NOT LIKE '%.webp'
    AND lower(value) NOT LIKE '%.pdf')
WHERE materials IS NOT NULL AND EXISTS (
  SELECT 1 FROM json_each(lessons.materials)
  WHERE lower(value) LIKE '%.png' OR lower(value) LIKE '%.jpg'
     OR lower(value) LIKE '%.jpeg' OR lower(value) LIKE '%.svg'
     OR lower(value) LIKE '%.gif' OR lower(value) LIKE '%.webp'
     OR lower(value) LIKE '%.pdf');

-- lesson_versions is deliberately left alone. A confirmed version records what
-- a teacher approved and may already have printed or exported, and migration
-- 004 makes those rows immutable by trigger. Rewriting one would change what
-- the record says was approved, which is a worse fault than the filename it
-- would remove. The working lesson is corrected; its confirmed history stands,
-- and confirming again writes a new version through the generator that now
-- refuses source files.
