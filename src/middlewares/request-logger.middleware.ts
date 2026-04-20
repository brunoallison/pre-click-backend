import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

export const requestLogger: RequestHandler = (req, res, next) => {
  const id = (req.headers['x-request-id'] as string) ?? randomUUID();
  (req as { id?: string }).id = id;
  res.setHeader('x-request-id', id);

  const start = Date.now();
  res.on('finish', () => {
    logger.info(
      {
        requestId: id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
      },
      'http',
    );
  });
  next();
};
