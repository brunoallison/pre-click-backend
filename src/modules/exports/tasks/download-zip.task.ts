import archiver from 'archiver';
import type { Repository } from 'typeorm';
import type { NextFunction, Request, Response } from 'express';
import { IsUUID } from 'class-validator';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyParams } from '../../../utils/schema.js';
import { HttpError } from '../../../utils/error.js';
import { ExportBatch } from '../../../entities/export-batch.entity.js';
import { ExportBatchFile } from '../../../entities/export-batch-file.entity.js';
import { GcsProvider } from '../../../providers/gcs/gcs.provider.js';

class DownloadZipParams {
  @IsUUID()
  batchId!: string;
}

/**
 * Download do ZIP com todos os arquivos do batch.
 * Usa archiver (streaming) — resposta direta na rota.
 */
@Injectable()
export class DownloadZipTask extends Task<never> {
  protected validations = [verifyParams(DownloadZipParams)];

  constructor(
    @Inject('ExportBatchRepository') private readonly batches: Repository<ExportBatch>,
    @Inject('ExportBatchFileRepository')
    private readonly batchFiles: Repository<ExportBatchFile>,
    private readonly gcs: GcsProvider,
  ) {
    super();
  }

  async execute(_input: BaseInput): Promise<never> {
    throw HttpError.Internal('use_handler', 'Use DownloadZipTask.zipHandler() para esta rota');
  }

  public static zipHandler(): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    return async (req, res, next) => {
      try {
        const { container } = await import('../../../utils/di.js');
        const task = container.resolve(DownloadZipTask);

        const tenantId = (req as { tenantId?: string }).tenantId;
        const batchId = Array.isArray(req.params.batchId)
          ? req.params.batchId[0]
          : req.params.batchId;

        if (!tenantId) {
          res.status(403).json({ code: 'forbidden', message: 'Tenant obrigatório' });
          return;
        }

        const batch = await task.batches.findOne({ where: { id: batchId, tenant_id: tenantId } });
        if (!batch) {
          res.status(404).json({ code: 'not_found', message: 'Export não encontrado' });
          return;
        }

        const files = await task.batchFiles.find({
          where: { batch_id: batchId },
          order: { sequence: 'ASC' },
        });

        if (files.length === 0) {
          res.status(404).json({ code: 'no_files', message: 'Nenhum arquivo no batch' });
          return;
        }

        // Se só tem 1 arquivo, retorna direto sem ZIP
        if (files.length === 1) {
          const buffer = await task.gcs.download(files[0].gcs_key);
          res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          );
          res.setHeader('Content-Disposition', `attachment; filename="${files[0].file_name}"`);
          res.send(buffer);
          return;
        }

        // Para múltiplos arquivos: streaming ZIP
        const zipFileName = `CLICK_${batchId.slice(0, 8)}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

        const archive = archiver('zip', { zlib: { level: 6 } });
        archive.on('error', (err: Error) => next(err));
        archive.pipe(res);

        for (const file of files) {
          const buffer = await task.gcs.download(file.gcs_key);
          archive.append(buffer, { name: file.file_name });
        }

        await archive.finalize();

        // Marcar todos como downloaded
        await task.batchFiles.update(
          { batch_id: batchId },
          { status: 'downloaded', downloaded_at: new Date() },
        );
      } catch (err) {
        next(err);
      }
    };
  }
}
