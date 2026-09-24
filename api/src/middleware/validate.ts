import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

/**
 * Parses request input at the route boundary. A parse failure is a 400 and never
 * reaches domain code, which is what keeps the hostile cases out of the handlers.
 */
export function validate(schemas: {
  body?: ZodTypeAny; params?: ZodTypeAny; query?: ZodTypeAny;
}): RequestHandler {
  return (req, res, next) => {
    for (const key of ['body', 'params', 'query'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        res.status(400).json({ error: 'invalid_request', details: result.error.flatten() });
        return;
      }
      // Express 5 makes req.query a getter, so assignment alone will not stick.
      Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true });
    }
    next();
  };
}
