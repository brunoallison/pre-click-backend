import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { HttpError } from '../utils/error.js';

export interface AccessTokenPayload {
  sub: string;
  tid: string | null;
  role: 'super_admin' | 'user';
}

export const authMiddleware: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw HttpError.Unauthorized('unauthorized', 'Token ausente');
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
    const authed = req as Request & {
      userId: string;
      tenantId: string | null;
      role: 'super_admin' | 'user';
    };
    authed.userId = payload.sub;
    authed.tenantId = payload.tid;
    authed.role = payload.role;
    next();
  } catch {
    throw HttpError.Unauthorized('unauthorized', 'Token inválido ou expirado');
  }
};

export const optionalAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as AccessTokenPayload;
    const authed = req as Request & {
      userId: string;
      tenantId: string | null;
      role: 'super_admin' | 'user';
    };
    authed.userId = payload.sub;
    authed.tenantId = payload.tid;
    authed.role = payload.role;
  } catch {
    // silencioso — rota opcional
  }
  next();
};
