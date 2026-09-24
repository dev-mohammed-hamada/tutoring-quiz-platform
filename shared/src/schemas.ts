import { z } from 'zod';

export const idParam = z.object({ id: z.coerce.number().int().positive() });
export type IdParam = z.infer<typeof idParam>;

export const loginBody = z.object({
  loginCode: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginBody = z.infer<typeof loginBody>;

export const createQuizBody = z.object({
  title: z.string().min(1).max(200),
  language: z.enum(['en', 'ar']),
  timeLimitMinutes: z.number().int().min(1).max(300),
  opensAt: z.string().datetime(),
  closesAt: z.string().datetime(),
  negativeMarking: z.boolean(),
  classIds: z.array(z.number().int().positive()).min(1),
}).refine((q) => new Date(q.closesAt) > new Date(q.opensAt), {
  message: 'closesAt must be after opensAt', path: ['closesAt'],
});
export type CreateQuizBody = z.infer<typeof createQuizBody>;

export const createQuestionBody = z.object({
  text: z.string().min(1).max(2000),
  points: z.number().int().positive().max(100_000),   // hundredths: 100 = 1.00 mark
  options: z.array(z.object({
    text: z.string().min(1).max(500),
    isCorrect: z.boolean(),
  })).length(4),
}).refine((q) => q.options.filter((o) => o.isCorrect).length === 1, {
  message: 'exactly one option must be correct', path: ['options'],
});
export type CreateQuestionBody = z.infer<typeof createQuestionBody>;

export const saveAnswerBody = z.object({
  selectedOptionId: z.number().int().positive().nullable(),
});
export type SaveAnswerBody = z.infer<typeof saveAnswerBody>;

export const answerParams = z.object({
  id: z.coerce.number().int().positive(),
  questionId: z.coerce.number().int().positive(),
});
export type AnswerParams = z.infer<typeof answerParams>;
