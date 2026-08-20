-- Up Migration

-- Convention for closed-set columns throughout this schema (role, locale,
-- status, and later sender/action/level): a `text` column plus a CHECK
-- constraint, not a native Postgres ENUM. Enums require ALTER TYPE ... ADD
-- VALUE outside a transaction to extend, which is more friction than this
-- project needs. Keep this convention consistent in every later migration.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username              citext NOT NULL UNIQUE,
  password_hash         text NOT NULL,
  role                  text NOT NULL CHECK (role IN ('teacher', 'student')),
  locale                text NOT NULL DEFAULT 'ru' CHECK (locale IN ('ru', 'en')),
  must_change_password  boolean NOT NULL DEFAULT false,
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- citext gives case-insensitive uniqueness and lookup for free (a young
-- student typing on a phone should not be locked out by capitalization).

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL
);

-- Supports the sweep job (lib/session.ts) that deletes expired rows.
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- Down Migration

DROP TABLE sessions;
DROP TABLE users;
DROP EXTENSION IF EXISTS citext;
