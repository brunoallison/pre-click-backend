import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { CreateStoreTask } from './tasks/create-store.task.js';
import { ListStoresTask } from './tasks/list-stores.task.js';
import { UpdateStoreTask } from './tasks/update-store.task.js';

export const storesRouter = Router();

storesRouter.use(authMiddleware, requireTenant);

storesRouter.get('/', ListStoresTask.handler());
storesRouter.post('/', CreateStoreTask.handler());
storesRouter.patch('/:id', UpdateStoreTask.handler());
// TODO: GET /:id, PATCH /:id/profile, POST /import, DELETE /:id
