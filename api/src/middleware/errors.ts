import type { ErrorRequestHandler } from 'express';

/** Express 5 forwards rejected async handlers here on its own. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === 'number' ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'internal_error' : (err?.code ?? 'error') });
};
