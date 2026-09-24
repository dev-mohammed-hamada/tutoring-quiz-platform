import { z } from 'zod';

export const idParam = z.object({ id: z.coerce.number().int().positive() });
export type IdParam = z.infer<typeof idParam>;

export const loginBody = z.object({
  loginCode: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginBody = z.infer<typeof loginBody>;
