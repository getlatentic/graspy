-- When an upload for the sample began, written before its object is put. An upload that dies between
-- the put and the row update leaves audio under a row that names no key; the sweep finds the ones a
-- day old by this, deletes what they may have put, and clears it.
ALTER TABLE samples ADD COLUMN upload_started_at INTEGER;
CREATE INDEX samples_upload_stalled ON samples (upload_started_at)
    WHERE state = 'awaiting_audio' AND upload_started_at IS NOT NULL;
