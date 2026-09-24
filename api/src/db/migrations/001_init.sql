CREATE TABLE classes (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            bigserial PRIMARY KEY,
  role          text NOT NULL CHECK (role IN ('student','teacher','principal')),
  full_name     text NOT NULL,
  login_code    text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  locale        text NOT NULL DEFAULT 'ar' CHECK (locale IN ('en','ar')),
  class_id      bigint REFERENCES classes(id),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Students belong to exactly one class; staff belong to none.
  CONSTRAINT student_has_class CHECK ((class_id IS NOT NULL) = (role = 'student'))
);

-- D-09: a teacher's reporting scope is their own quizzes INTERSECTED with these classes.
CREATE TABLE teacher_classes (
  teacher_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id   bigint NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, class_id)
);

CREATE TABLE quizzes (
  id                 bigserial PRIMARY KEY,
  title              text NOT NULL,
  author_id          bigint NOT NULL REFERENCES users(id),
  language           text NOT NULL DEFAULT 'en' CHECK (language IN ('en','ar')),
  time_limit_minutes integer NOT NULL DEFAULT 20 CHECK (time_limit_minutes BETWEEN 1 AND 300),
  opens_at           timestamptz NOT NULL,
  closes_at          timestamptz NOT NULL,
  -- D-05: whether wrong answers deduct. It lives on the quiz, not the teacher,
  -- because the same teacher runs both kinds.
  negative_marking   boolean NOT NULL DEFAULT false,
  is_published       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT window_ordered CHECK (closes_at > opens_at)
);

CREATE TABLE quiz_classes (
  quiz_id  bigint NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  class_id bigint NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (quiz_id, class_id)
);

CREATE TABLE questions (
  id       bigserial PRIMARY KEY,
  quiz_id  bigint NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position integer NOT NULL,
  text     text NOT NULL,
  -- Integer hundredths: 100 = 1.00 mark. Never a float.
  points   integer NOT NULL CHECK (points > 0),
  UNIQUE (quiz_id, position)
);

CREATE TABLE options (
  id          bigserial PRIMARY KEY,
  question_id bigint NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position    integer NOT NULL,
  text        text NOT NULL,
  is_correct  boolean NOT NULL DEFAULT false,
  UNIQUE (question_id, position)
);
-- At most one correct option per question. "Exactly one" is checked at publish time.
CREATE UNIQUE INDEX one_correct_option ON options(question_id) WHERE is_correct;

CREATE TABLE attempts (
  id               bigserial PRIMARY KEY,
  quiz_id          bigint NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at       timestamptz NOT NULL DEFAULT now(),
  -- Written once at start and never recomputed: the only clock that counts.
  expires_at       timestamptz NOT NULL,
  submitted_at     timestamptz,
  submitted_reason text CHECK (submitted_reason IN ('manual','expired')),
  raw_score        integer,   -- may be negative; principal only
  display_score    integer,   -- floored at zero
  max_score        integer NOT NULL,
  -- D-03: one attempt per student per quiz, enforced here rather than in the UI.
  UNIQUE (quiz_id, student_id)
);

CREATE TABLE answers (
  id                 bigserial PRIMARY KEY,
  attempt_id         bigint NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id        bigint NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option_id bigint REFERENCES options(id),
  -- D-08: snapshots taken when the answer was given, so editing a question later
  -- cannot move a grade that has already been recorded.
  points_possible    integer NOT NULL,
  points_awarded     integer NOT NULL,
  answered_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE sessions (
  id         text PRIMARY KEY,           -- sha256 of the cookie token, never the token
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON attempts(student_id);
CREATE INDEX ON attempts(quiz_id);
CREATE INDEX ON answers(attempt_id);
CREATE INDEX ON quiz_classes(class_id);
CREATE INDEX ON teacher_classes(class_id);
CREATE INDEX ON sessions(expires_at);
