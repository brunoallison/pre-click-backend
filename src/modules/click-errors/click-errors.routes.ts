import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';

export const clickErrorsRouter = Router();
clickErrorsRouter.use(authMiddleware, requireTenant);

// TODO: POST /exports/:id/files/:fileId/errors, GET/POST resolve, reexport
