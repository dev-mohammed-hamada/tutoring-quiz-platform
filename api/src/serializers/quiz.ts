interface QuizRow {
  id: number; title: string; language: 'en' | 'ar'; time_limit_minutes: number;
  opens_at: Date; closes_at: Date; negative_marking: boolean; is_published: boolean;
  class_ids?: number[]; question_count?: number; total_marks?: number;
}

export const serializeQuizForTeacher = (q: QuizRow) => ({
  id: q.id,
  title: q.title,
  language: q.language,
  timeLimitMinutes: q.time_limit_minutes,
  opensAt: q.opens_at.toISOString(),
  closesAt: q.closes_at.toISOString(),
  negativeMarking: q.negative_marking,
  isPublished: q.is_published,
  classIds: q.class_ids ?? [],
  questionCount: q.question_count ?? 0,
  totalMarks: q.total_marks ?? 0,
});

/**
 * The student shape is built field by field and has no code path that can reach
 * an option, let alone which one is correct.
 */
export const serializeQuizForStudent = (q: QuizRow & {
  state: string; display_score: number | null; attempt_id: number | null;
}) => ({
  id: q.id,
  title: q.title,
  language: q.language,
  timeLimitMinutes: q.time_limit_minutes,
  opensAt: q.opens_at.toISOString(),
  closesAt: q.closes_at.toISOString(),
  negativeMarking: q.negative_marking,
  questionCount: q.question_count ?? 0,
  totalMarks: q.total_marks ?? 0,
  state: q.state,
  attemptId: q.attempt_id,
  displayScore: q.display_score,
});
