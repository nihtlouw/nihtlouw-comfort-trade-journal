-- Additive per-user audio storage (max 5 tracks / 200 MB enforced in application transactions).
BEGIN;
CREATE TABLE IF NOT EXISTS bloom_audio_tracks (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES bloom_auth_user(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size integer NOT NULL CHECK (size > 0),
  duration_sec double precision,
  sort_order integer NOT NULL DEFAULT 0,
  chunk_size integer NOT NULL CHECK (chunk_size > 0),
  expected_chunks integer NOT NULL CHECK (expected_chunks > 0),
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bloom_audio_tracks_user_idx ON bloom_audio_tracks(user_id);

CREATE TABLE IF NOT EXISTS bloom_audio_chunks (
  track_id text NOT NULL REFERENCES bloom_audio_tracks(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  size integer NOT NULL CHECK (size > 0),
  data bytea NOT NULL,
  PRIMARY KEY (track_id, chunk_index)
);
COMMIT;
