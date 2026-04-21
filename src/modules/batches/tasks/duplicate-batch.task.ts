import { type DataSource, type Repository } from 'typeorm';
import { Order } from '../../../entities/order.entity.js';
import { OrderBatch } from '../../../entities/order-batch.entity.js';
import { OrderItem } from '../../../entities/order-item.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { DuplicateOrderBatchInput, type OrderBatchDetailOutput } from '../dto/batches.dto.js';

@Injectable()
export class DuplicateBatchTask extends Task<OrderBatchDetailOutput> {
  protected validations = [verifyBody(DuplicateOrderBatchInput, true)];

  constructor(
    @Inject('DataSource') private readonly ds: DataSource,
    @Inject('OrderBatchRepository') private readonly batches: Repository<OrderBatch>,
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('OrderItemRepository') private readonly items: Repository<OrderItem>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<OrderBatchDetailOutput> {
    const tenantId = input.headers.tenantId as string;
    const userId = input.headers.userId as string;
    const { id } = input.params as { id: string };
    const dto = input.body as DuplicateOrderBatchInput;
    const name = dto.name.trim();

    const source = await this.batches.findOne({ where: { id, tenant_id: tenantId } });
    if (!source) {
      throw HttpError.NotFound('batch_not_found', 'Pedido não encontrado');
    }

    const duplicated = await this.batches.findOne({
      where: { tenant_id: tenantId, collection_id: source.collection_id, name },
    });
    if (duplicated) {
      throw HttpError.Conflict(
        'batch_name_conflict',
        'Já existe um pedido com este nome nesta coleção',
      );
    }

    const sourceOrders = await this.orders.find({
      where: { batch_id: source.id, tenant_id: tenantId },
      select: ['id', 'store_id'],
    });
    const storeIds = sourceOrders.map((o) => o.store_id);

    const sourceItems = sourceOrders.length > 0
      ? await this.items.find({
          where: sourceOrders.map((o) => ({ order_id: o.id, tenant_id: tenantId })),
        })
      : [];

    // Map sourceOrderId → items for quick lookup inside transaction
    const itemsByOrder = new Map<string, OrderItem[]>();
    for (const item of sourceItems) {
      const arr = itemsByOrder.get(item.order_id) ?? [];
      arr.push(item);
      itemsByOrder.set(item.order_id, arr);
    }

    return this.ds.transaction(async (manager) => {
      const batchRepo = manager.getRepository(OrderBatch);
      const orderRepo = manager.getRepository(Order);
      const itemRepo = manager.getRepository(OrderItem);

      const batch = batchRepo.create({
        tenant_id: tenantId,
        collection_id: source.collection_id,
        name,
        status: 'draft',
        export_count: 0,
        last_exported_at: null,
        created_by: userId,
      });
      const saved = await batchRepo.save(batch);

      let itemCount = 0;
      if (storeIds.length > 0) {
        const newOrders = await orderRepo.save(
          sourceOrders.map((src) =>
            orderRepo.create({
              tenant_id: tenantId,
              collection_id: source.collection_id,
              batch_id: saved.id,
              store_id: src.store_id,
              status: 'draft',
              created_by: userId,
            }),
          ),
        );

        const newItems: OrderItem[] = [];
        for (const newOrder of newOrders) {
          const srcOrder = sourceOrders.find((o) => o.store_id === newOrder.store_id);
          if (!srcOrder) continue;
          const srcItems = itemsByOrder.get(srcOrder.id) ?? [];
          for (const si of srcItems) {
            newItems.push(
              itemRepo.create({
                tenant_id: tenantId,
                order_id: newOrder.id,
                product_id: si.product_id,
                grade_id: si.grade_id,
                multiplier: si.multiplier,
                rdd_override_serial: si.rdd_override_serial,
                override_forbidden: si.override_forbidden,
                override_reason: si.override_reason,
              }),
            );
          }
        }

        if (newItems.length > 0) {
          await itemRepo.save(newItems);
          itemCount = newItems.length;
        }
      }

      return {
        id: saved.id,
        collection_id: saved.collection_id,
        name: saved.name,
        status: saved.status,
        export_count: 0,
        last_exported_at: null,
        store_count: storeIds.length,
        item_count: itemCount,
        total_pieces: 0,
        store_ids: storeIds,
        created_at: saved.created_at.toISOString(),
        updated_at: saved.updated_at.toISOString(),
      };
    });
  }
}
