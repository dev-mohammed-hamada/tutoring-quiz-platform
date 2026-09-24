// Tests always run against the dedicated test database, never the dev one.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://mohammedhamada@localhost:5432/quiz_test';
