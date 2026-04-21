import { Router } from 'express';
import multer from 'multer';
import { aiRateLimit } from '../../middlewares/ai-rate-limit.middleware.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { ChatTask } from './tasks/chat.task.js';
import { DeleteContextTask } from './tasks/delete-context.task.js';
import { ListContextsTask } from './tasks/list-contexts.task.js';
import { SuggestGradeTask } from './tasks/suggest-grade.task.js';
import { UploadContextTask } from './tasks/upload-context.task.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const aiRouter = Router();
aiRouter.use(authMiddleware, requireTenant, aiRateLimit);

aiRouter.post('/chat', ChatTask.handler());
aiRouter.post('/suggest-grade', SuggestGradeTask.handler());
aiRouter.get('/context', ListContextsTask.handler());
aiRouter.post('/context/upload', upload.single('file'), UploadContextTask.handler());
aiRouter.delete('/context/:id', DeleteContextTask.handler());
