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

export const createClassBody = z.object({ name: z.string().min(1).max(32) });
export type CreateClassBody = z.infer<typeof createClassBody>;

export const createUserBody = z.object({
  role: z.enum(['student', 'teacher', 'principal']),
  fullName: z.string().min(1).max(200),
  loginCode: z.string().min(1).max(64),
  password: z.string().min(6).max(256),
  locale: z.enum(['en', 'ar']),
  classId: z.number().int().positive().optional(),
}).refine((u) => (u.role === 'student') === (u.classId !== undefined), {
  message: 'students need a class; staff must not have one', path: ['classId'],
});
export type CreateUserBody = z.infer<typeof createUserBody>;

export const resetPasswordBody = z.object({ password: z.string().min(6).max(256) });

export const assignmentsBody = z.object({
  teacherId: z.number().int().positive(),
  classIds: z.array(z.number().int().positive()),
});
export type AssignmentsBody = z.infer<typeof assignmentsBody>;

export const importBody = z.object({
  kind: z.enum(['students', 'teachers']),
  csv: z.string().min(1).max(2_000_000),
});
export type ImportBody = z.infer<typeof importBody>;

export const updateMeBody = z.object({ locale: z.enum(['en', 'ar']) });
export type UpdateMeBody = z.infer<typeof updateMeBody>;

/**
 * Every field optional: this is a patch. The ordering invariant between opensAt
 * and closesAt cannot live here, because a patch may carry only one of them —
 * the route checks it against the merged result instead.
 */
export const updateQuizBody = z.object({
  title: z.string().min(1).max(200).optional(),
  language: z.enum(['en', 'ar']).optional(),
  timeLimitMinutes: z.number().int().min(1).max(300).optional(),
  opensAt: z.string().datetime().optional(),
  closesAt: z.string().datetime().optional(),
  negativeMarking: z.boolean().optional(),
  classIds: z.array(z.number().int().positive()).min(1).optional(),
});
export type UpdateQuizBody = z.infer<typeof updateQuizBody>;

export const questionParams = z.object({
  id: z.coerce.number().int().positive(),
  questionId: z.coerce.number().int().positive(),
});
export type QuestionParams = z.infer<typeof questionParams>;
