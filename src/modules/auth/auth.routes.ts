import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rateLimit } from '../../middlewares/rate-limit.middleware.js';
import { LoginTask } from './tasks/login.task.js';
import { LogoutTask } from './tasks/logout.task.js';
import { MeTask } from './tasks/me.task.js';
import { RefreshTask } from './tasks/refresh.task.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  rateLimit({ capacity: 10, refillPerSec: 10 / 60, keyFn: (req) => req.ip ?? 'unknown' }),
  LoginTask.handler(),
);
authRouter.post('/refresh', RefreshTask.handler());
authRouter.post('/logout', authMiddleware, LogoutTask.handler());
authRouter.get('/me', authMiddleware, MeTask.handler());
