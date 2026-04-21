import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { GetTenantBudgetTask } from './tasks/get-tenant-budget.task.js';
import { PutStoreBudgetTask } from './tasks/put-store-budget.task.js';
import { PutTenantBudgetTask } from './tasks/put-tenant-budget.task.js';

export const tenantBudgetRouter = Router();
tenantBudgetRouter.use(authMiddleware, requireTenant);

tenantBudgetRouter.get('/', GetTenantBudgetTask.handler());
tenantBudgetRouter.put('/', PutTenantBudgetTask.handler());
tenantBudgetRouter.put('/stores/:id', PutStoreBudgetTask.handler());
