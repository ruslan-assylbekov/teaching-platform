-- Up Migration

-- One thread per student (teacher <-> that student) -- design spec §4.4's
-- deliberately text-only, 1:1 chat needs no separate conversations table.
CREATE TABLE messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  sender      text NOT NULL CHECK (sender IN ('teacher', 'student')),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Every read is "this thread, ordered by time"; the SSE endpoint's
-- catch-up-since-Last-Event-ID query needs the same index.
CREATE INDEX messages_student_id_created_at_idx ON messages (student_id, created_at);

-- Unread state is one timestamp per participant, not a flag per message
-- (design spec §4.4) -- one row per side of each conversation.
CREATE TABLE read_markers (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  last_read_at  timestamptz NOT NULL,
  PRIMARY KEY (user_id, student_id)
);

-- Down Migration

DROP TABLE read_markers;
DROP TABLE messages;
