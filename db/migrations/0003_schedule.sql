-- Up Migration

-- start_time is a plain wall-clock `time`, not `timestamptz` -- the
-- schema-level enforcement of §4.3's "local wall-clock plus timezone
-- identifier, not UTC" rule. Individual occurrences are resolved to real
-- instants only at read time, by domain/schedule/expand.ts.
CREATE TABLE class_slots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  weekday           smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time        time NOT NULL,
  duration_minutes  integer NOT NULL CHECK (duration_minutes > 0),
  timezone          text NOT NULL,
  active_from       date NOT NULL,
  active_until      date,
  CHECK (active_until IS NULL OR active_until >= active_from)
);

CREATE INDEX class_slots_student_id_idx ON class_slots (student_id);

-- At most one override per slot per date (§4.3: "absence of a row means
-- the pattern holds", implying presence means exactly one deviation).
CREATE TABLE class_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         uuid NOT NULL REFERENCES class_slots(id) ON DELETE CASCADE,
  original_date   date NOT NULL,
  action          text NOT NULL CHECK (action IN ('cancelled', 'moved')),
  new_date        date,
  new_start_time  time,
  note            text,
  CHECK (action = 'cancelled' OR new_date IS NOT NULL OR new_start_time IS NOT NULL),
  UNIQUE (slot_id, original_date)
);

CREATE INDEX class_overrides_slot_id_idx ON class_overrides (slot_id);

-- Down Migration

DROP TABLE class_overrides;
DROP TABLE class_slots;
