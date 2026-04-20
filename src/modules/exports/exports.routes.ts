import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { ListExportsTask } from './tasks/list-exports.task.js';
import { GetExportTask } from './tasks/get-export.task.js';
import { DownloadFileTask } from './tasks/download-file.task.js';
import { DownloadZipTask } from './tasks/download-zip.task.js';

export const exportsRouter = Router();
exportsRouter.use(authMiddleware, requireTenant);

// GET /exports — lista batches do tenant
exportsRouter.get('/', ListExportsTask.handler());

// GET /exports/:batchId — detalhe com files
exportsRouter.get('/:batchId', GetExportTask.handler());

// GET /exports/:batchId/files/:fileId/download — download direto do xlsx
exportsRouter.get('/:batchId/files/:fileId/download', DownloadFileTask.downloadHandler());

// GET /exports/:batchId/zip — download ZIP do batch
exportsRouter.get('/:batchId/zip', DownloadZipTask.zipHandler());
