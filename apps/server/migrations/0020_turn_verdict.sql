-- How the teacher marked a turn, and when nothing could be marked, why: a turn that could not be heard
-- is not a try and says nothing about the child, whereas "I don't know" is a try and does.
ALTER TABLE tutoring_turns ADD COLUMN verdict TEXT;
ALTER TABLE tutoring_turns ADD COLUMN heard_kind TEXT;
