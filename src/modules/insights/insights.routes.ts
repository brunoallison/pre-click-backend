import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';

export const insightsRouter = Router();
insightsRouter.use(authMiddleware, requireTenant);

// TODO: GET /orders/:id/insights, GET /dashboard/insights
