import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';

export const tenantBudgetRouter = Router();
tenantBudgetRouter.use(authMiddleware, requireTenant);

// TODO: GET /, PUT /, PUT /stores/:id/budget, GET /usage
