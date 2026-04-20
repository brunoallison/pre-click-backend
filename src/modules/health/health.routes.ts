import { Router } from 'express';
import { AppDataSource } from '../../database/data-source.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

healthRouter.get('/ready', async (_req, res) => {
  try {
    await AppDataSource.query('SELECT 1');
    res.json({ status: 'ready', db: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});
