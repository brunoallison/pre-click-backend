import type { Repository } from 'typeorm';
import { Order } from '../../../entities/order.entity.js';
import { OrderBatch } from '../../../entities/order-batch.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { logger } from '../../../utils/logger.js';
import { CreateExportTask } from '../../exports/tasks/create-export.task.js';
import type { ExportBatchOutput } from '../../exports/dto/exports.dto.js';
import type { OrderBatchExportOutput } from '../dto/batches.dto.js';

@Injectable()
export class ExportBatchTask extends Task<OrderBatchExportOutput> {
  constructor(
    @Inject('OrderBatchRepository') private readonly batches: Repository<OrderBatch>,
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject(CreateExportTask) private readonly createExport: CreateExportTask,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<OrderBatchExportOutput> {
    const tenantId = input.headers.tenantId as string;
    const userId = input.headers.userId as string;
    const { id } = input.params as { id: string };

    const batch = await this.batches.findOne({ where: { id, tenant_id: tenantId } });
    if (!batch) {
      throw HttpError.NotFound('batch_not_found', 'Pedido não encontrado');
    }

    const orders = await this.orders.find({
      where: { batch_id: batch.id, tenant_id: tenantId },
    });
    if (orders.length === 0) {
      throw HttpError.Unprocessable('empty_batch', 'Pedido sem lojas — nada a exportar');
    }

    const exportBatchIds: string[] = [];
    let totalRows = 0;
    let totalFiles = 0;
    const errors: Array<{ order_id: string; code: string; message: string }> = [];

    for (const order of orders) {
      try {
        const result = (await this.createExport.runAsJobBase({
          params: { orderId: order.id },
          body: { strategy: 'by_rdd', order_batch_id: batch.id },
          headers: { tenantId, userId, role: input.headers.role },
        })) as ExportBatchOutput;
        exportBatchIds.push(result.id);
        totalRows += result.total_rows;
        totalFiles += result.total_files;
      } catch (err) {
        const code = (err as { code?: string }).code ?? 'export_failed';
        const message = (err as { message?: string }).message ?? 'Falha ao exportar pedido';
        errors.push({ order_id: order.id, code, message });
        logger.warn(
          { err, order_id: order.id, batch_id: batch.id },
          'export-batch: falha numa loja',
        );
      }
    }

    if (exportBatchIds.length === 0) {
      throw HttpError.Unprocessable(
        'all_orders_failed',
        `Nenhuma loja pôde ser exportada. Erros: ${errors.map((e) => e.message).join(' | ')}`,
      );
    }

    const now = new Date();
    batch.export_count += 1;
    batch.last_exported_at = now;
    batch.status = 'baixado';
    await this.batches.save(batch);

    return {
      batch_id: batch.id,
      export_count: batch.export_count,
      last_exported_at: now.toISOString(),
      total_files: totalFiles,
      total_rows: totalRows,
      export_batch_ids: exportBatchIds,
      zip_ready: true,
    };
  }
}
