import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/require-role.middleware.js';
import { DeleteAiContextAdminTask } from './tasks/delete-ai-context-admin.task.js';
import { ImportBaseTask } from './tasks/import-base.task.js';
import { ListAiContextsAdminTask } from './tasks/list-ai-contexts-admin.task.js';
import { ListImportsTask } from './tasks/list-imports.task.js';
import { ListSeasonsTask } from './tasks/list-seasons.task.js';
import { ListTenantsTask } from './tasks/list-tenants.task.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export const adminRouter = Router();
adminRouter.use(authMiddleware, requireRole('super_admin'));

adminRouter.get('/tenants', ListTenantsTask.handler());
adminRouter.get('/seasons', ListSeasonsTask.handler());
adminRouter.post('/catalog/import', upload.single('file'), ImportBaseTask.streamHandler());
adminRouter.get('/catalog/imports', ListImportsTask.handler());
adminRouter.get('/ai/contexts', ListAiContextsAdminTask.handler());
adminRouter.delete('/ai/contexts/:id', DeleteAiContextAdminTask.handler());
// TODO: import-warnings, aliases, jobs/:id, POST /tenants, PATCH /tenants/:id
