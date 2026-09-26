-- NERDC teaches time and money as mathematics measurement, not as general knowledge, so four
-- lessons changed id. Carry every learner's evidence across with them.
UPDATE lesson_events SET plan_id = 'mathematics.time.days-of-the-week' WHERE plan_id = 'everyday.calendar.days-of-the-week';
UPDATE lesson_events SET plan_id = 'mathematics.time.months-of-the-year' WHERE plan_id = 'everyday.calendar.months-of-the-year';
UPDATE lesson_events SET plan_id = 'mathematics.time.telling-the-time' WHERE plan_id = 'everyday.time.telling-the-time';
UPDATE lesson_events SET plan_id = 'mathematics.money.naira-and-kobo' WHERE plan_id = 'everyday.money.naira-and-kobo';

UPDATE lesson_offers SET plan_id = 'mathematics.time.days-of-the-week' WHERE plan_id = 'everyday.calendar.days-of-the-week';
UPDATE lesson_offers SET plan_id = 'mathematics.time.months-of-the-year' WHERE plan_id = 'everyday.calendar.months-of-the-year';
UPDATE lesson_offers SET plan_id = 'mathematics.time.telling-the-time' WHERE plan_id = 'everyday.time.telling-the-time';
UPDATE lesson_offers SET plan_id = 'mathematics.money.naira-and-kobo' WHERE plan_id = 'everyday.money.naira-and-kobo';

UPDATE samples SET metadata_json = json_set(metadata_json, '$.plan_id', 'mathematics.time.days-of-the-week')
    WHERE json_extract(metadata_json, '$.plan_id') = 'everyday.calendar.days-of-the-week';
UPDATE samples SET metadata_json = json_set(metadata_json, '$.plan_id', 'mathematics.time.months-of-the-year')
    WHERE json_extract(metadata_json, '$.plan_id') = 'everyday.calendar.months-of-the-year';
UPDATE samples SET metadata_json = json_set(metadata_json, '$.plan_id', 'mathematics.time.telling-the-time')
    WHERE json_extract(metadata_json, '$.plan_id') = 'everyday.time.telling-the-time';
UPDATE samples SET metadata_json = json_set(metadata_json, '$.plan_id', 'mathematics.money.naira-and-kobo')
    WHERE json_extract(metadata_json, '$.plan_id') = 'everyday.money.naira-and-kobo';
