-- An offer records that the teacher gave this learner this step, once. It is not consumed:
-- a submission counts once because a sample has one turn, and mastery counts distinct days.
DROP INDEX lesson_offers_open;

DELETE FROM lesson_offers WHERE id NOT IN (
    SELECT MIN(id) FROM lesson_offers GROUP BY owner_id, plan_id, event_id
);

ALTER TABLE lesson_offers DROP COLUMN redeemed_at;

CREATE UNIQUE INDEX lesson_offers_step ON lesson_offers (owner_id, plan_id, event_id);
