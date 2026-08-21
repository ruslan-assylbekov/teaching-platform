-- Up Migration

-- One homework per student (design decision: matches every other feature
-- in this app -- schedule, chat -- being 1:1 teacher/student, not a
-- reusable template assigned to many).
CREATE TABLE homeworks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  title       text NOT NULL,
  topic       text NOT NULL,
  deadline    timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- title is teacher-only (never sent to a student client, same rule as
-- students.private_notes/parent_phone/parent_name) -- topic is what the
-- student sees instead.
CREATE INDEX homeworks_student_id_idx ON homeworks (student_id);

CREATE TABLE homework_questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id       uuid NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
  position          integer NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('multiple_choice', 'open')),
  prompt            text NOT NULL,
  -- Only set for kind='open': one or more acceptable answers, matched
  -- case/whitespace-normalized (domain/homework/grading.ts). NULL for
  -- multiple_choice, where correctness lives on homework_choices instead.
  accepted_answers  text[],
  UNIQUE (homework_id, position)
);

CREATE TABLE homework_choices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   uuid NOT NULL REFERENCES homework_questions(id) ON DELETE CASCADE,
  position      integer NOT NULL,
  label         text NOT NULL,
  is_correct    boolean NOT NULL DEFAULT false,
  UNIQUE (question_id, position)
);

-- UNIQUE on homework_id enforces "one submission, final" at the schema
-- level, not just in the app -- a second submit attempt fails the insert
-- rather than silently overwriting the first grade.
CREATE TABLE homework_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id   uuid NOT NULL UNIQUE REFERENCES homeworks(id) ON DELETE CASCADE,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  -- Frozen at grading time -- editing a homework's questions later must not
  -- retroactively change an already-graded submission's displayed score.
  score         integer NOT NULL,
  max_score     integer NOT NULL
);

CREATE TABLE homework_answers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  uuid NOT NULL REFERENCES homework_submissions(id) ON DELETE CASCADE,
  question_id    uuid NOT NULL REFERENCES homework_questions(id) ON DELETE CASCADE,
  choice_id      uuid REFERENCES homework_choices(id),
  open_answer    text,
  is_correct     boolean NOT NULL,
  UNIQUE (submission_id, question_id)
);

-- Down Migration

DROP TABLE homework_answers;
DROP TABLE homework_submissions;
DROP TABLE homework_choices;
DROP TABLE homework_questions;
DROP TABLE homeworks;
