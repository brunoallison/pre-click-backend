import type { RequestHandler } from 'express';
import { HttpError } from '../utils/error.js';

export const requireTenant: RequestHandler = (req, _res, next) => {
  const tenantId = (req as { tenantId?: string }).tenantId;
  if (!tenantId) {
    throw HttpError.Forbidden('forbidden', 'Esta rota exige contexto de tenant');
  }
  next();
};
