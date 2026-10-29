-- Additive only: deliberately does not modify the old shared trades or settings.
BEGIN;
CREATE TABLE IF NOT EXISTS bloom_auth_user (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false, image text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bloom_auth_session (
  id text PRIMARY KEY, expires_at timestamptz NOT NULL, token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text, user_agent text, user_id text NOT NULL REFERENCES bloom_auth_user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS bloom_auth_session_user_idx ON bloom_auth_session(user_id);
CREATE TABLE IF NOT EXISTS bloom_auth_account (
  id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES bloom_auth_user(id) ON DELETE CASCADE,
  access_token text, refresh_token text, id_token text, access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz, scope text, password text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bloom_auth_account_user_idx ON bloom_auth_account(user_id);
CREATE TABLE IF NOT EXISTS bloom_auth_verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bloom_auth_verification_identifier_idx ON bloom_auth_verification(identifier);
CREATE TABLE IF NOT EXISTS bloom_auth_rate_limit (
  id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL, last_request bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS bloom_private_journals (
  user_id text PRIMARY KEY REFERENCES bloom_auth_user(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bloom_journal_images (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES bloom_auth_user(id) ON DELETE CASCADE,
  name text NOT NULL, type text NOT NULL, size integer NOT NULL, data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bloom_journal_images_user_idx ON bloom_journal_images(user_id);
COMMIT;
