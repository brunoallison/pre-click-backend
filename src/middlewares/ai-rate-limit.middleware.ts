import type { RequestHandler } from 'express';
import { HttpError } from '../utils/error.js';

// Bucket por tenant — 60 chamadas/h. Implementação in-memory; versão Redis fica para produção.
const tenantCounters = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 60;

export const aiRateLimit: RequestHandler = (req, _res, next) => {
  const tenantId = (req as { tenantId?: string }).tenantId;
  if (!tenantId) {
    throw HttpError.Forbidden('forbidden', 'AI requer tenant');
  }
  const now = Date.now();
  const entry = tenantCounters.get(tenantId);
  if (!entry || entry.resetAt < now) {
    tenantCounters.set(tenantId, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }
  if (entry.count >= LIMIT) {
    throw HttpError.TooMany('ai_rate_limited', 'Limite de chamadas IA atingido para este tenant');
  }
  entry.count += 1;
  next();
};
