/**
 * A teacher sees their own quizzes, in the classes they are assigned to - the
 * intersection, not the union. This predicate is the entirety of that rule and
 * must not be reimplemented anywhere else. $1 is always the caller's id.
 */
export const TEACHER_SCOPE = `
  q.author_id = $1
  AND EXISTS (
    SELECT 1 FROM quiz_classes qc
      JOIN teacher_classes tc ON tc.class_id = qc.class_id AND tc.teacher_id = $1
     WHERE qc.quiz_id = q.id)
`;

/**
 * The principal branch is unrestricted but must still reference $1, and must
 * cast it. A bare TRUE leaves the caller's id bound to a parameter the query
 * never mentions; an uncast `$1 IS NOT NULL` gives Postgres nothing to infer a
 * type from and fails with 42P18. Either way the principal's query breaks while
 * the identical teacher query works, which is a nasty shape of bug to chase.
 */
export const scopeFor = (role: string) =>
  role === 'principal' ? '$1::bigint IS NOT NULL' : TEACHER_SCOPE;
