import type { Repository } from 'typeorm';
import { Order } from '../../../entities/order.entity.js';
import { OrderBatch } from '../../../entities/order-batch.entity.js';
import { OrderItem } from '../../../entities/order-item.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import type { OrderBatchDetailOutput } from '../dto/batches.dto.js';

@Injectable()
export class GetBatchTask extends Task<OrderBatchDetailOutput> {
  constructor(
    @Inject('OrderBatchRepository') private readonly batches: Repository<OrderBatch>,
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('OrderItemRepository') private readonly items: Repository<OrderItem>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<OrderBatchDetailOutput> {
    const tenantId = input.headers.tenantId as string;
    const { id } = input.params as { id: string };

    const batch = await this.batches.findOne({ where: { id, tenant_id: tenantId } });
    if (!batch) {
      throw HttpError.NotFound('batch_not_found', 'Pedido não encontrado');
    }

    const orders = await this.orders.find({
      where: { batch_id: batch.id, tenant_id: tenantId },
      select: ['id', 'store_id'],
    });
    const storeIds = orders.map((o) => o.store_id);
    const orderIds = orders.map((o) => o.id);

    let itemCount = 0;
    let totalPieces = 0;
    if (orderIds.length > 0) {
      const agg = (await this.items
        .createQueryBuilder('oi')
        .select('COUNT(oi.id)', 'item_count')
        .addSelect('COALESCE(SUM(oi.multiplier * g.total_pieces), 0)', 'total_pieces')
        .leftJoin('grade', 'g', 'g.id = oi.grade_id')
        .where('oi.order_id IN (:...orderIds)', { orderIds })
        .andWhere('oi.tenant_id = :tenantId', { tenantId })
        .getRawOne()) as { item_count: string; total_pieces: string } | undefined;
      itemCount = Number(agg?.item_count ?? 0);
      totalPieces = Number(agg?.total_pieces ?? 0);
    }

    return {
      id: batch.id,
      collection_id: batch.collection_id,
      name: batch.name,
      status: batch.status,
      export_count: batch.export_count,
      last_exported_at: batch.last_exported_at ? batch.last_exported_at.toISOString() : null,
      store_count: storeIds.length,
      item_count: itemCount,
      total_pieces: totalPieces,
      store_ids: storeIds,
      created_at: batch.created_at.toISOString(),
      updated_at: batch.updated_at.toISOString(),
    };
  }
}
