import { Router } from 'express';
import multer from 'multer';
import { aiRateLimit } from '../../middlewares/ai-rate-limit.middleware.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { ArchiveConversationTask } from './tasks/archive-conversation.task.js';
import { DeleteContextTask } from './tasks/delete-context.task.js';
import { GetConversationTask } from './tasks/get-conversation.task.js';
import { ListContextsTask } from './tasks/list-contexts.task.js';
import { ListConversationsTask } from './tasks/list-conversations.task.js';
import { OrchestrateChatTask } from './tasks/orchestrate-chat.task.js';
import { SuggestGradeTask } from './tasks/suggest-grade.task.js';
import { UploadContextTask } from './tasks/upload-context.task.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const aiRouter = Router();
aiRouter.use(authMiddleware, requireTenant, aiRateLimit);

// Chat com orquestrador (skill-based, multi-turn)
aiRouter.post('/chat', OrchestrateChatTask.handler());

// Suggest grade (mantido para compatibilidade)
aiRouter.post('/suggest-grade', SuggestGradeTask.handler());

// Conversas persistentes
aiRouter.get('/conversations', ListConversationsTask.handler());
aiRouter.get('/conversations/:id', GetConversationTask.handler());
aiRouter.delete('/conversations/:id', ArchiveConversationTask.handler());

// Contexto (arquivos de referência)
aiRouter.get('/context', ListContextsTask.handler());
aiRouter.post('/context/upload', upload.single('file'), UploadContextTask.handler());
aiRouter.delete('/context/:id', DeleteContextTask.handler());
