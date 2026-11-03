-- Additive SaaS subscription, webhook idempotency, and S3/R2 object key support.
BEGIN;

ALTER TABLE bloom_journal_images
  ADD COLUMN IF NOT EXISTS storage_key text;

ALTER TABLE bloom_journal_images
  ALTER COLUMN data SET DEFAULT '';

CREATE TABLE IF NOT EXISTS bloom_subscriptions (
  user_id text PRIMARY KEY REFERENCES bloom_auth_user(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'inactive',
  provider text,
  currency text,
  billing_cycle text,
  external_customer_id text,
  external_subscription_id text,
  last_order_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bloom_subscriptions_status_idx
  ON bloom_subscriptions(status, current_period_end);

CREATE INDEX IF NOT EXISTS bloom_subscriptions_ext_sub_idx
  ON bloom_subscriptions(external_subscription_id);

CREATE TABLE IF NOT EXISTS bloom_billing_events (
  event_key text PRIMARY KEY,
  provider text NOT NULL,
  user_id text REFERENCES bloom_auth_user(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
