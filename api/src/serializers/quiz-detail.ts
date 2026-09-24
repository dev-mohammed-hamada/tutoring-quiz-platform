/**
 * The authoring shape. Unlike every other quiz serializer this one *does* carry
 * `isCorrect`, because an author editing a paper has to see the key. The route
 * that uses it is staff-only and scoped; no student code path reaches it.
 */
interface DetailRow {
  id: number; title: string; language: 'en' | 'ar'; time_limit_minutes: number;
  opens_at: Date; closes_at: Date; negative_marking: boolean; is_published: boolean;
  class_ids: number[] | null;
}

interface DetailQuestion {
  id: number; position: number; text: string; points: number;
  options: { id: number; position: number; text: string; is_correct: boolean }[];
}

export const serializeQuizForAuthor = (q: DetailRow, questions: DetailQuestion[]) => ({
  id: q.id,
  title: q.title,
  language: q.language,
  timeLimitMinutes: q.time_limit_minutes,
  opensAt: q.opens_at.toISOString(),
  closesAt: q.closes_at.toISOString(),
  negativeMarking: q.negative_marking,
  isPublished: q.is_published,
  classIds: q.class_ids ?? [],
  totalMarks: questions.reduce((sum, qq) => sum + qq.points, 0),
  questions: questions.map((qq) => ({
    id: qq.id,
    position: qq.position,
    text: qq.text,
    points: qq.points,
    options: qq.options.map((o) => ({
      id: o.id, position: o.position, text: o.text, isCorrect: o.is_correct,
    })),
  })),
});
