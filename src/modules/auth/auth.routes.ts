import type { CookieOptions } from 'express';
import { Router } from 'express';
import { env } from '../../config/env.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rateLimit } from '../../middlewares/rate-limit.middleware.js';
import { LoginTask } from './tasks/login.task.js';
import { LogoutTask } from './tasks/logout.task.js';
import { MeTask } from './tasks/me.task.js';
import { RefreshTask } from './tasks/refresh.task.js';
import type { LoginInternalOutput, LoginOutput } from './dto/login.dto.js';

export const authRouter = Router();

const REFRESH_COOKIE_NAME = 'refresh_token';

function refreshCookieOptions(): CookieOptions {
  const base: CookieOptions = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SECURE ? 'none' : 'lax',
    path: '/',
    maxAge: env.JWT_REFRESH_TTL_SEC * 1000,
  };
  // domain só em prod; em localhost, deixar implícito evita rejeição
  if (env.COOKIE_DOMAIN !== 'localhost') base.domain = env.COOKIE_DOMAIN;
  return base;
}

authRouter.post(
  '/login',
  rateLimit({ capacity: 10, refillPerSec: 10 / 60, keyFn: (req) => req.ip ?? 'unknown' }),
  LoginTask.handler({
    onResponse: (result, _req, res) => {
      const typed = result as LoginInternalOutput;
      res.cookie(REFRESH_COOKIE_NAME, typed.refresh_jti, refreshCookieOptions());
      const { refresh_jti: _jti, ...body } = typed;
      return body satisfies LoginOutput;
    },
  }),
);

authRouter.post('/refresh', RefreshTask.handler());

authRouter.post(
  '/logout',
  authMiddleware,
  LogoutTask.handler({
    onResponse: (_result, _req, res) => {
      const clearOpts: CookieOptions = { path: '/' };
      if (env.COOKIE_DOMAIN !== 'localhost') clearOpts.domain = env.COOKIE_DOMAIN;
      res.clearCookie(REFRESH_COOKIE_NAME, clearOpts);
    },
  }),
);

authRouter.get('/me', authMiddleware, MeTask.handler());
