import type { ErrorRequestHandler } from 'express';
import { HttpErrorBase } from '../utils/error.js';
import { logger } from '../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = (req as { id?: string }).id ?? '-';

  if (err instanceof HttpErrorBase) {
    logger.warn(
      { requestId, code: err.code, status: err.status, context: err.context },
      'http error',
    );
    res.status(err.status).json({
      error: { code: err.code, message: err.message, context: err.context },
      request_id: requestId,
    });
    return;
  }

  logger.error({ requestId, err: err instanceof Error ? err.message : err }, 'unhandled error');
  res.status(500).json({
    error: { code: 'internal_error', message: 'Erro interno — tente novamente' },
    request_id: requestId,
  });
};
