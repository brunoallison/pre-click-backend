import type { Repository } from 'typeorm';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyQuery } from '../../../utils/schema.js';
import { ExportBatch } from '../../../entities/export-batch.entity.js';
import { ListExportsInput, type ExportBatchOutput } from '../dto/exports.dto.js';

@Injectable()
export class ListExportsTask extends Task<ExportBatchOutput[]> {
  protected validations = [verifyQuery(ListExportsInput)];

  constructor(@Inject('ExportBatchRepository') private readonly batches: Repository<ExportBatch>) {
    super();
  }

  async execute(input: BaseInput): Promise<ExportBatchOutput[]> {
    const tenantId = input.headers.tenantId as string;
    const query = input.query as ListExportsInput;

    const qb = this.batches
      .createQueryBuilder('b')
      .where('b.tenant_id = :tenantId', { tenantId })
      .orderBy('b.created_at', 'DESC');

    if (query.order_id) qb.andWhere('b.order_id = :orderId', { orderId: query.order_id });

    // Filtragem por store_id e collection_id requer join com order
    if (query.store_id || query.collection_id) {
      qb.innerJoin('b.order', 'o');
      if (query.store_id) qb.andWhere('o.store_id = :storeId', { storeId: query.store_id });
      if (query.collection_id)
        qb.andWhere('o.collection_id = :collectionId', { collectionId: query.collection_id });
    }

    const batches = await qb.getMany();
    return batches.map((b) => ({
      id: b.id,
      order_id: b.order_id,
      tenant_id: b.tenant_id,
      strategy: b.strategy,
      total_rows: b.total_rows,
      total_files: b.total_files,
      triggered_by: b.triggered_by,
      created_at: b.created_at.toISOString(),
    }));
  }
}
