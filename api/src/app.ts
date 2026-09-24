import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
