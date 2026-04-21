import type { Repository } from 'typeorm';
import { Order } from '../../../entities/order.entity.js';
import { OrderBatch } from '../../../entities/order-batch.entity.js';
import { Store } from '../../../entities/store.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { CreateOrderInput, type OrderOutput } from '../dto/orders.dto.js';

@Injectable()
export class CreateOrderTask extends Task<OrderOutput> {
  protected validations = [verifyBody(CreateOrderInput, true)];

  constructor(
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('OrderBatchRepository') private readonly batches: Repository<OrderBatch>,
    @Inject('StoreRepository') private readonly stores: Repository<Store>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<OrderOutput> {
    const tenantId = input.headers.tenantId as string;
    const userId = input.headers.userId as string;
    const dto = input.body as CreateOrderInput;

    const batch = await this.batches.findOne({
      where: { id: dto.batch_id, tenant_id: tenantId },
    });
    if (!batch) {
      throw HttpError.NotFound('batch_not_found', 'Pedido (OrderBatch) não encontrado');
    }

    const store = await this.stores.findOne({
      where: { id: dto.store_id, tenant_id: tenantId, is_active: true, is_dummy: false },
    });
    if (!store) {
      throw HttpError.BadRequest(
        'invalid_store',
        'Loja não pertence ao tenant ou está inativa/dummy',
      );
    }

    // Idempotente por (batch_id, store_id).
    const existing = await this.orders.findOne({
      where: { tenant_id: tenantId, batch_id: dto.batch_id, store_id: dto.store_id },
    });

    if (existing) {
      return {
        id: existing.id,
        store_id: existing.store_id,
        collection_id: existing.collection_id,
        batch_id: existing.batch_id,
        status: existing.status,
        items: [],
        totals: { pieces: 0, rrp_brl: 0, skus_distinct: 0 },
        updated_at: existing.updated_at.toISOString(),
        etag: `"${existing.updated_at.getTime()}"`,
      };
    }

    const order = this.orders.create({
      tenant_id: tenantId,
      collection_id: batch.collection_id,
      batch_id: batch.id,
      store_id: dto.store_id,
      status: 'draft',
      created_by: userId,
    });
    const saved = await this.orders.save(order);

    return {
      id: saved.id,
      store_id: saved.store_id,
      collection_id: saved.collection_id,
      batch_id: saved.batch_id,
      status: saved.status,
      items: [],
      totals: { pieces: 0, rrp_brl: 0, skus_distinct: 0 },
      updated_at: saved.updated_at.toISOString(),
      etag: `"${saved.updated_at.getTime()}"`,
    };
  }
}
