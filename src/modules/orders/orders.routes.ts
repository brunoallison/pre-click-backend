import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rateLimit } from '../../middlewares/rate-limit.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { CreateOrderTask } from './tasks/create-order.task.js';
import { GetOrderTask } from './tasks/get-order.task.js';
import { ListOrdersTask } from './tasks/list-orders.task.js';
import { UpdateOrderStatusTask } from './tasks/update-order-status.task.js';
import { UpsertOrderItemTask } from './tasks/upsert-order-item.task.js';
import { DeleteOrderItemTask } from './tasks/delete-order-item.task.js';
import { GetOrderSummaryTask } from './tasks/get-order-summary.task.js';
import { CopyOrderItemsTask } from './tasks/copy-order-items.task.js';
import { CreateExportTask } from '../exports/tasks/create-export.task.js';

export const ordersRouter = Router();
ordersRouter.use(authMiddleware, requireTenant);

// GET /orders — lista pedidos do tenant com filtros opcionais
ordersRouter.get('/', ListOrdersTask.handler());

// POST /orders — cria pedido (idempotente por collection_id + store_id)
ordersRouter.post('/', CreateOrderTask.handler());

// GET /orders/:id — pedido completo com items + ETag + 304
ordersRouter.get('/:id', GetOrderTask.handlerWithEtag());

// PATCH /orders/:id — atualiza status com validação de transição
ordersRouter.patch('/:id', UpdateOrderStatusTask.handler());

// GET /orders/:id/summary — totais do pedido
ordersRouter.get('/:id/summary', GetOrderSummaryTask.handler());

// POST /orders/:id/copy-from — copia itens de outra loja
ordersRouter.post('/:id/copy-from', CopyOrderItemsTask.handler());

// POST /orders/:id/items — upsert de item (rate limit específico)
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

// DELETE /orders/:id/items/:itemId — remove item
ordersRouter.delete('/:id/items/:itemId', DeleteOrderItemTask.handler());

// POST /orders/:orderId/export — gera batch síncrono ou dry_run
ordersRouter.post('/:orderId/export', CreateExportTask.handler());
