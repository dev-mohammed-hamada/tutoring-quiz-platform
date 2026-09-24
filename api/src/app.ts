import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { authRoutes } from './routes/auth.js';
import { quizRoutes } from './routes/quizzes.js';
import { attemptRoutes } from './routes/attempts.js';
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

  app.use(errorHandler);   // must stay last
  return app;
}
