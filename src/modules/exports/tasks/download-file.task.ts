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

class DownloadFileParams {
  @IsUUID()
  batchId!: string;

  @IsUUID()
  fileId!: string;
}

/**
 * Download direto do arquivo .xlsx do batch.
 * Marca o arquivo como downloaded e retorna o Buffer diretamente.
 * O handler da rota faz o pipe para a response (Content-Disposition: attachment).
 */
@Injectable()
export class DownloadFileTask extends Task<{ buffer: Buffer; fileName: string }> {
  protected validations = [verifyParams(DownloadFileParams)];

  constructor(
    @Inject('ExportBatchRepository') private readonly batches: Repository<ExportBatch>,
    @Inject('ExportBatchFileRepository')
    private readonly batchFiles: Repository<ExportBatchFile>,
    private readonly gcs: GcsProvider,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<{ buffer: Buffer; fileName: string }> {
    const tenantId = input.headers.tenantId as string;
    const { batchId, fileId } = input.params as { batchId: string; fileId: string };

    const batch = await this.batches.findOne({ where: { id: batchId, tenant_id: tenantId } });
    if (!batch) throw HttpError.NotFound('not_found', 'Export não encontrado');

    const file = await this.batchFiles.findOne({ where: { id: fileId, batch_id: batchId } });
    if (!file) throw HttpError.NotFound('not_found', 'Arquivo não encontrado');

    const buffer = await this.gcs.download(file.gcs_key);

    // Marca como downloaded (idempotente)
    if (file.status === 'ready') {
      await this.batchFiles.update(
        { id: file.id },
        { status: 'downloaded', downloaded_at: new Date() },
      );
    }

    return { buffer, fileName: file.file_name };
  }

  /**
   * Handler customizado: faz o pipe diretamente para a response em vez de retornar JSON.
   */
  public static downloadHandler(): (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<void> {
    return async (req, res, next) => {
      try {
        const { container } = await import('../../../utils/di.js');
        const task = container.resolve(DownloadFileTask);
        const result = await task.runAsJobBase({
          params: req.params,
          headers: {
            userId: (req as { userId?: string }).userId,
            tenantId: (req as { tenantId?: string }).tenantId,
            role: (req as { role?: 'super_admin' | 'user' }).role,
          },
        });
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
        res.send(result.buffer);
      } catch (err) {
        next(err);
      }
    };
  }
}
