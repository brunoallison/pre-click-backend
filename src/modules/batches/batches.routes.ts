import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireTenant } from '../../middlewares/require-tenant.middleware.js';
import { ListBatchesTask } from './tasks/list-batches.task.js';
import { CreateBatchTask } from './tasks/create-batch.task.js';
import { GetBatchTask } from './tasks/get-batch.task.js';
import { RenameBatchTask } from './tasks/rename-batch.task.js';
import { DeleteBatchTask } from './tasks/delete-batch.task.js';
import { DuplicateBatchTask } from './tasks/duplicate-batch.task.js';
import { ExportBatchTask } from './tasks/export-batch.task.js';
import { DownloadBatchZipTask } from './tasks/download-batch-zip.task.js';

export const batchesRouter = Router();
batchesRouter.use(authMiddleware, requireTenant);

// GET /batches?collection_id=X&status=draft — lista pedidos do tenant
batchesRouter.get('/', ListBatchesTask.handler());

// POST /batches — cria pedido nomeado + orders por loja
batchesRouter.post('/', CreateBatchTask.handler());

// GET /batches/:id — detalhe do pedido com contadores e store_ids
batchesRouter.get('/:id', GetBatchTask.handler());

// PATCH /batches/:id — renomeia pedido
batchesRouter.patch('/:id', RenameBatchTask.handler());

// DELETE /batches/:id — remove pedido (CASCADE orders + items)
batchesRouter.delete('/:id', DeleteBatchTask.handler());

// POST /batches/:id/duplicate — clona pedido (mesmas lojas, sem items)
batchesRouter.post('/:id/duplicate', DuplicateBatchTask.handler());

// POST /batches/:id/export — exporta todas as lojas do batch e marca como baixado
batchesRouter.post('/:id/export', ExportBatchTask.handler());

// GET /batches/:id/zip — download do zip agregando arquivos da última exportação
batchesRouter.get('/:id/zip', DownloadBatchZipTask.zipHandler());
