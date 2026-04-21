import archiver from 'archiver';
import type { Repository } from 'typeorm';
import type { NextFunction, Request, Response } from 'express';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { HttpError } from '../../../utils/error.js';
import { ExportBatch } from '../../../entities/export-batch.entity.js';
import { ExportBatchFile } from '../../../entities/export-batch-file.entity.js';
import { OrderBatch } from '../../../entities/order-batch.entity.js';
import { Collection } from '../../../entities/collection.entity.js';
import { Store } from '../../../entities/store.entity.js';
import { GcsProvider } from '../../../providers/gcs/gcs.provider.js';

/**
 * Baixa zip único do OrderBatch agregando todos os arquivos da última exportação.
 * Estrutura do zip: uma subpasta por loja ({store_number}_{safe_name}/arquivo.xlsx).
 */
@Injectable()
export class DownloadBatchZipTask extends Task<never> {
  constructor(
    @Inject('OrderBatchRepository') private readonly batches: Repository<OrderBatch>,
    @Inject('ExportBatchRepository') private readonly exports: Repository<ExportBatch>,
    @Inject('ExportBatchFileRepository')
    private readonly exportFiles: Repository<ExportBatchFile>,
    @Inject('CollectionRepository') private readonly collections: Repository<Collection>,
    @Inject('StoreRepository') private readonly stores: Repository<Store>,
    @Inject(GcsProvider) private readonly gcs: GcsProvider,
  ) {
    super();
  }

  async execute(_input: BaseInput): Promise<never> {
    throw HttpError.Internal('use_handler', 'Use DownloadBatchZipTask.zipHandler() para esta rota');
  }

  public static zipHandler(): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    return async (req, res, next) => {
      try {
        const { container } = await import('../../../utils/di.js');
        const task = container.resolve(DownloadBatchZipTask);

        const tenantId = (req as { tenantId?: string }).tenantId;
        const batchId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        if (!tenantId) {
          res.status(403).json({ code: 'forbidden', message: 'Tenant obrigatório' });
          return;
        }

        const batch = await task.batches.findOne({ where: { id: batchId, tenant_id: tenantId } });
        if (!batch || !batch.last_exported_at) {
          res.status(404).json({
            code: 'not_exported',
            message: 'Pedido ainda não foi exportado',
          });
          return;
        }

        // ?at=<iso> permite baixar uma operação específica; sem parâmetro = última exportação.
        const atParam = req.query['at'] as string | undefined;
        const anchor = atParam ? new Date(atParam) : batch.last_exported_at;
        const since = new Date(anchor.getTime() - 2_000);
        const until = new Date(anchor.getTime() + 30 * 60 * 1000); // janela de 30 min

        const exportBatches = await task.exports
          .createQueryBuilder('eb')
          .where('eb.tenant_id = :tenantId', { tenantId })
          .andWhere('eb.order_batch_id = :obid', { obid: batch.id })
          .andWhere('eb.created_at >= :since', { since })
          .andWhere('eb.created_at <= :until', { until })
          .getMany();

        if (exportBatches.length === 0) {
          res.status(404).json({ code: 'no_export', message: 'Nenhum arquivo gerado' });
          return;
        }

        const exportIds = exportBatches.map((e) => e.id);
        const files = await task.exportFiles
          .createQueryBuilder('f')
          .where('f.batch_id IN (:...exportIds)', { exportIds })
          .orderBy('f.store_id', 'ASC')
          .addOrderBy('f.sequence', 'ASC')
          .getMany();

        if (files.length === 0) {
          res.status(404).json({ code: 'no_files', message: 'Nenhum arquivo no batch' });
          return;
        }

        // Carrega stores para nomear as subpastas
        const storeIds = [...new Set(files.map((f) => f.store_id).filter((id): id is string => !!id))];
        const storeList = storeIds.length > 0 ? await task.stores.findByIds(storeIds) : [];
        const storeMap = new Map(storeList.map((s) => [s.id, s]));

        const collection = await task.collections.findOne({ where: { id: batch.collection_id } });
        const safeBatchName = batch.name.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
        const zipFileName = `PEDIDO_${collection?.code ?? 'COL'}_${safeBatchName}_Click.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

        const archive = archiver('zip', { zlib: { level: 6 } });
        archive.on('error', (err: Error) => next(err));
        archive.pipe(res);

        for (const file of files) {
          const buffer = await task.gcs.download(file.gcs_key);
          const store = file.store_id ? storeMap.get(file.store_id) : null;
          const folder = store
            ? `${store.store_number ?? '0'}_${store.legal_name.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 30)}`
            : 'outros';
          archive.append(buffer, { name: `${folder}/${file.file_name}` });
        }

        await archive.finalize();

        await task.exportFiles
          .createQueryBuilder()
          .update(ExportBatchFile)
          .set({ status: 'downloaded', downloaded_at: new Date() })
          .where('batch_id IN (:...exportIds)', { exportIds })
          .execute();
      } catch (err) {
        next(err);
      }
    };
  }
}
