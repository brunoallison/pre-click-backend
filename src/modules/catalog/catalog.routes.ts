import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { CreateGradeTask } from './tasks/create-grade.task.js';
import { ListCategoriesTask } from './tasks/list-categories.task.js';
import { ListGradesTask } from './tasks/list-grades.task.js';
import { ListProductsTask } from './tasks/list-products.task.js';

export const catalogRouter = Router();
catalogRouter.use(authMiddleware, requireTenant);

catalogRouter.get('/products', ListProductsTask.handler());
catalogRouter.get(
  '/categories',
  ListCategoriesTask.handler({
    onResponse: (result, _req, res) => {
      res.setHeader('Cache-Control', 'private, max-age=86400');
      return result;
    },
  }),
);
catalogRouter.get('/grades', ListGradesTask.handler());
catalogRouter.post(
  '/grades',
  CreateGradeTask.handler({
    onResponse: (result, _req, res) => {
      res.status(201);
      return result;
    },
  }),
);
// TODO: GET /products/:id, PATCH/DELETE grades, rdds, images
