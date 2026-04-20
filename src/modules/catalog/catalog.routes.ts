import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { ListProductsTask } from './tasks/list-products.task.js';

export const catalogRouter = Router();
catalogRouter.use(authMiddleware, requireTenant);

catalogRouter.get('/products', ListProductsTask.handler());
// TODO: GET /products/:id, grades (GET/POST/PATCH/DELETE), rdds, images
