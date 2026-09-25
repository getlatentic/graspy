-- Record the shape of the school day the periods are worked out from.
--
-- The timetable grid was eight rows for everyone, which is a school day rather
-- than anyone's. A school states when it opens, when it closes, how long a
-- period runs and when it breaks, and its periods follow from that — so what is
-- kept here is the description, never the list. A list would drift from the
-- times beside it the first time a bell moved.
--
-- One row, because one teacher keeps one school day. The row is created when a
-- teacher first describes theirs; until then the app uses the day a Nigerian
-- secondary school keeps, which is stated in the frontend beside the arithmetic
-- that reads it.
CREATE TABLE school_day (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    starts_at TEXT NOT NULL CHECK (starts_at GLOB '[0-2][0-9]:[0-5][0-9]'),
    ends_at TEXT NOT NULL CHECK (ends_at GLOB '[0-2][0-9]:[0-5][0-9]' AND ends_at > starts_at),
    period_minutes INTEGER NOT NULL CHECK (period_minutes IN (40, 45, 60)),
    short_break_after_period INTEGER CHECK (short_break_after_period > 0),
    short_break_minutes INTEGER CHECK (short_break_minutes BETWEEN 5 AND 120),
    long_break_after_period INTEGER CHECK (long_break_after_period > 0),
    long_break_minutes INTEGER CHECK (long_break_minutes BETWEEN 5 AND 120),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- A break is both its place and its length, or it is not a break.
    CHECK ((short_break_after_period IS NULL) = (short_break_minutes IS NULL)),
    CHECK ((long_break_after_period IS NULL) = (long_break_minutes IS NULL)),
    CHECK (
        short_break_after_period IS NULL
        OR long_break_after_period IS NULL
        OR short_break_after_period <> long_break_after_period
    )
);
