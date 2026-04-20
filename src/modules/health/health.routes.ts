import { Router } from 'express';
import { container } from '../../utils/di.js';
import { redisClient } from '../../database/redis-client.js';
import type { DataSource } from 'typeorm';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

healthRouter.get('/ready', async (_req, res) => {
  let dbOk = false;
  let redisOk = false;

  try {
    const ds = container.resolve<DataSource>('DataSource');
    await ds.query('SELECT 1');
    dbOk = true;
  } catch {
    // intencionalmente silenciado — estado capturado em dbOk
  }

  try {
    const pong = await redisClient.ping();
    redisOk = pong === 'PONG';
  } catch {
    // intencionalmente silenciado — estado capturado em redisOk
  }

  const status = dbOk && redisOk ? 200 : 503;
  res.status(status).json({
    db: dbOk ? 'ok' : 'fail',
    redis: redisOk ? 'ok' : 'fail',
  });
});
