import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { ListCollectionsTask } from './tasks/list-collections.task.js';

export const collectionsRouter = Router();
collectionsRouter.use(authMiddleware);

collectionsRouter.get('/', ListCollectionsTask.handler());
// TODO: GET /:id
