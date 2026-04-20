import type { RequestHandler } from 'express';
import { HttpError } from '../utils/error.js';

export function requireRole(role: 'super_admin' | 'user'): RequestHandler {
  return (req, _res, next) => {
    const actual = (req as { role?: 'super_admin' | 'user' }).role;
    if (actual !== role) {
      throw HttpError.Forbidden('forbidden', `Rota restrita a ${role}`);
    }
    next();
  };
}
