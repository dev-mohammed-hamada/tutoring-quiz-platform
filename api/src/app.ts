import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { authRoutes } from './routes/auth.js';
import { quizRoutes } from './routes/quizzes.js';
import { attemptRoutes } from './routes/attempts.js';
import { reportRoutes } from './routes/reports.js';
import { adminRoutes } from './routes/admin.js';
import { errorHandler } from './middleware/errors.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', authRoutes);
  app.use('/api', quizRoutes);
  app.use('/api', attemptRoutes);
  app.use('/api', reportRoutes);
  app.use('/api', adminRoutes);

  // In production the same Node process serves the built SPA. In development the
  // Vite server does it and proxies /api here, so this block is simply absent.
  //
  // Resolved from this module, not from the working directory: `npm run dev -w api`
  // starts in api/, `npm start` at the repo root and the container in /app, and all
  // three must find the same web/dist. Both api/src/ and api/dist/ are two levels down.
  const webDist = process.env.WEB_DIST
    ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    // SPA fallback: any non-/api path is a client route, so hand back index.html
    // and let react-router resolve it. The negative lookahead is what keeps an
    // unmatched /api/... a 404 instead of silently answering it with the app shell.
    app.get(/^(?!\/api\/).*/, (_req, res) => { res.sendFile(join(webDist, 'index.html')); });
  }

  app.use(errorHandler);   // must stay last
  return app;
}
