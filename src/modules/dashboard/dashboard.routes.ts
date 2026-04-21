import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { GetSummaryTask } from './tasks/get-summary.task.js';
import { GetSharesTask } from './tasks/get-shares.task.js';
import { GetKpisTask } from './tasks/get-kpis.task.js';
import { GetDashboardInsightsTask } from '../insights/tasks/get-dashboard-insights.task.js';

export const dashboardRouter = Router();
dashboardRouter.use(authMiddleware, requireTenant);

// GET /dashboard/summary?collection_id= — totais do tenant para a coleção
dashboardRouter.get('/summary', GetSummaryTask.handler());

// GET /dashboard/shares?collection_id=&dimension= — 4 donuts
dashboardRouter.get('/shares', GetSharesTask.handler());

// GET /dashboard/kpis?collection_id=&prev_collection_id= — KPIs com deltas
dashboardRouter.get('/kpis', GetKpisTask.handler());

// GET /dashboard/insights?collection_id= — insights agregados da coleção
dashboardRouter.get('/insights', GetDashboardInsightsTask.handler());
