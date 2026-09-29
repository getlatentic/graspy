-- A child's recording is deleted once its turn has ended, unless a parent agreed to keep it. The
-- row records that the audio went (audio_key cannot be emptied: a ready sample must have one) and,
-- for a recording that is kept, when it must go.
ALTER TABLE samples ADD COLUMN audio_deleted_at INTEGER;
ALTER TABLE samples ADD COLUMN expires_at INTEGER;

-- What the sweep looks for: audio kept past its time, and audio whose turn was never settled.
CREATE INDEX samples_audio_expiry ON samples (expires_at)
    WHERE audio_deleted_at IS NULL AND expires_at IS NOT NULL;
CREATE INDEX samples_audio_undecided ON samples (uploaded_at)
    WHERE state = 'ready' AND audio_deleted_at IS NULL AND expires_at IS NULL;
