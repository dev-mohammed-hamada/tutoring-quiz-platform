import { formatMarks } from '../domain/marks.js';

interface OptionRow { id: number; position: number; text: string }
interface QuestionRow { id: number; position: number; text: string; points: number; options: OptionRow[] }

/**
 * The shape served while a quiz is being sat. It is constructed field by field
 * and has no branch that can reach `is_correct` - the answer key is not merely
 * hidden here, it is absent from the object.
 */
export const serializeQuestionForAttempt = (q: QuestionRow) => ({
  id: q.id,
  position: q.position,
  text: q.text,
  points: q.points,
  pointsLabel: formatMarks(q.points),
  options: q.options.map((o) => ({ id: o.id, position: o.position, text: o.text })),
});
