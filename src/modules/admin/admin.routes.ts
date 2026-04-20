import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/require-role.middleware.js';
import { ImportBaseTask } from './tasks/import-base.task.js';
import { ListImportsTask } from './tasks/list-imports.task.js';
import { ListTenantsTask } from './tasks/list-tenants.task.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export const adminRouter = Router();
adminRouter.use(authMiddleware, requireRole('super_admin'));

adminRouter.get('/tenants', ListTenantsTask.handler());
adminRouter.post('/catalog/import', upload.single('file'), ImportBaseTask.handler());
adminRouter.get('/catalog/imports', ListImportsTask.handler());
// TODO: seasons, import-warnings, aliases, jobs/:id, POST /tenants, PATCH /tenants/:id
