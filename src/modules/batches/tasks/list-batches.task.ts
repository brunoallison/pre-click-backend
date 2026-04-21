import type { Repository } from 'typeorm';
import { OrderBatch } from '../../../entities/order-batch.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyQuery } from '../../../utils/schema.js';
import {
  ListOrderBatchesQuery,
  type OrderBatchStatus,
  type OrderBatchSummaryOutput,
} from '../dto/batches.dto.js';

interface Row {
  id: string;
  collection_id: string;
  name: string;
  status: OrderBatchStatus;
  export_count: string;
  last_exported_at: Date | null;
  created_at: Date;
  updated_at: Date;
  store_count: string;
  item_count: string;
  total_pieces: string | null;
}

@Injectable()
export class ListBatchesTask extends Task<{ items: OrderBatchSummaryOutput[] }> {
  protected validations = [verifyQuery(ListOrderBatchesQuery)];

  constructor(@Inject('OrderBatchRepository') private readonly batches: Repository<OrderBatch>) {
    super();
  }

  async execute(input: BaseInput): Promise<{ items: OrderBatchSummaryOutput[] }> {
    const tenantId = input.headers.tenantId as string;
    const q = input.query as ListOrderBatchesQuery;

    const qb = this.batches
      .createQueryBuilder('ob')
      .select('ob.id', 'id')
      .addSelect('ob.collection_id', 'collection_id')
      .addSelect('ob.name', 'name')
      .addSelect('ob.status', 'status')
      .addSelect('ob.export_count', 'export_count')
      .addSelect('ob.last_exported_at', 'last_exported_at')
      .addSelect('ob.created_at', 'created_at')
      .addSelect('ob.updated_at', 'updated_at')
      .addSelect('COUNT(DISTINCT o.id)', 'store_count')
      .addSelect('COUNT(oi.id)', 'item_count')
      .addSelect('COALESCE(SUM(oi.multiplier * g.total_pieces), 0)', 'total_pieces')
      .leftJoin('order', 'o', 'o.batch_id = ob.id')
      .leftJoin('order_item', 'oi', 'oi.order_id = o.id')
      .leftJoin('grade', 'g', 'g.id = oi.grade_id')
      .where('ob.tenant_id = :tenantId', { tenantId })
      .groupBy('ob.id')
      .orderBy('ob.created_at', 'DESC');

    if (q.collection_id) qb.andWhere('ob.collection_id = :cid', { cid: q.collection_id });
    if (q.status) qb.andWhere('ob.status = :status', { status: q.status });

    const rows = (await qb.getRawMany()) as Row[];

    const items: OrderBatchSummaryOutput[] = rows.map((r) => ({
      id: r.id,
      collection_id: r.collection_id,
      name: r.name,
      status: r.status,
      export_count: Number(r.export_count),
      last_exported_at: r.last_exported_at ? r.last_exported_at.toISOString() : null,
      store_count: Number(r.store_count),
      item_count: Number(r.item_count),
      total_pieces: Number(r.total_pieces ?? 0),
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
    }));

    return { items };
  }
}
