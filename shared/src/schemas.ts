import { z } from 'zod';

export const idParam = z.object({ id: z.coerce.number().int().positive() });
export type IdParam = z.infer<typeof idParam>;
