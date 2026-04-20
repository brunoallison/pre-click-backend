import { Router } from 'express';
import { aiRateLimit } from '../../middlewares/ai-rate-limit.middleware.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';

export const aiRouter = Router();
aiRouter.use(authMiddleware, requireTenant, aiRateLimit);

// TODO: POST /suggest-grade, /chat, /explain-insight, /apply-suggestions, context upload/list/delete, GET /usage
