import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rateLimit } from '../../middlewares/rate-limit.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { UpsertOrderItemTask } from './tasks/upsert-order-item.task.js';
import { CreateExportTask } from '../exports/tasks/create-export.task.js';

export const ordersRouter = Router();
ordersRouter.use(authMiddleware, requireTenant);

// Upsert tem bucket próprio conforme arquitetura §3.5
ordersRouter.post(
  '/:orderId/items',
  rateLimit({
    capacity: 60,
    refillPerSec: 2,
    keyFn: (req) => {
      const r = req as { userId?: string; tenantId?: string };
      return `${r.tenantId ?? 'na'}:${r.userId ?? 'na'}`;
    },
  }),
  UpsertOrderItemTask.handler(),
);

// POST /orders/:orderId/export — gera batch síncrono ou dry_run
ordersRouter.post('/:orderId/export', CreateExportTask.handler());

// TODO: GET /, GET /:id, POST /, PATCH /:id, DELETE /:id/items/:itemId, POST /:id/copy-from, GET /:id/summary
