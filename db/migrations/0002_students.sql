-- Up Migration

CREATE TABLE students (
  user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name      text NOT NULL,
  grade          text NOT NULL,
  school         text,
  level          text NOT NULL,
  objectives     text,
  private_notes  text,
  parent_phone   text,
  parent_name    text,
  started_at     date NOT NULL DEFAULT CURRENT_DATE
);

-- private_notes, parent_phone, parent_name are teacher-only (design spec
-- §4.2). Enforced at the query layer (db/queries/students.ts) rather than
-- here -- Postgres has no per-column ACL granular enough for "visible to
-- one application role but not another" without a view per caller, which
-- would fight the single-query-module-per-entity convention of §7.4.

-- Down Migration

DROP TABLE students;
