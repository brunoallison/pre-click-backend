import type { Repository } from 'typeorm';
import { IsUUID } from 'class-validator';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyParams } from '../../../utils/schema.js';
import { HttpError } from '../../../utils/error.js';
import { ExportBatch } from '../../../entities/export-batch.entity.js';
import { ExportBatchFile } from '../../../entities/export-batch-file.entity.js';
import type { ExportBatchOutput } from '../dto/exports.dto.js';

class ExportParams {
  @IsUUID()
  batchId!: string;
}

@Injectable()
export class GetExportTask extends Task<ExportBatchOutput> {
  protected validations = [verifyParams(ExportParams)];

  constructor(
    @Inject('ExportBatchRepository') private readonly batches: Repository<ExportBatch>,
    @Inject('ExportBatchFileRepository')
    private readonly batchFiles: Repository<ExportBatchFile>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<ExportBatchOutput> {
    const tenantId = input.headers.tenantId as string;
    const { batchId } = input.params as { batchId: string };

    const batch = await this.batches.findOne({ where: { id: batchId, tenant_id: tenantId } });
    if (!batch) throw HttpError.NotFound('not_found', 'Export não encontrado');

    const files = await this.batchFiles.find({
      where: { batch_id: batchId },
      order: { sequence: 'ASC' },
    });

    return {
      id: batch.id,
      order_id: batch.order_id,
      tenant_id: batch.tenant_id,
      strategy: batch.strategy,
      total_rows: batch.total_rows,
      total_files: batch.total_files,
      triggered_by: batch.triggered_by,
      created_at: batch.created_at.toISOString(),
      files: files.map((f) => ({
        id: f.id,
        sequence: f.sequence,
        file_name: f.file_name,
        gcs_key: f.gcs_key,
        row_count: f.row_count,
        rdd: f.rdd,
        store_id: f.store_id,
        status: f.status,
        downloaded_at: f.downloaded_at?.toISOString() ?? null,
        sent_at: f.sent_at?.toISOString() ?? null,
      })),
    };
  }
}
