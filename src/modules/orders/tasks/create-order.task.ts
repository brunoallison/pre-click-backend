import type { Repository } from 'typeorm';
import { Order } from '../../../entities/order.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { CreateOrderInput, type OrderOutput } from '../dto/orders.dto.js';

@Injectable()
export class CreateOrderTask extends Task<OrderOutput> {
  protected validations = [verifyBody(CreateOrderInput, true)];

  constructor(
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<OrderOutput> {
    const tenantId = input.headers.tenantId as string;
    const userId = input.headers.userId as string;
    const dto = input.body as CreateOrderInput;

    // Idempotente: se já existe retorna o existente
    const existing = await this.orders.findOne({
      where: { tenant_id: tenantId, collection_id: dto.collection_id, store_id: dto.store_id },
    });

    if (existing) {
      return {
        id: existing.id,
        store_id: existing.store_id,
        collection_id: existing.collection_id,
        status: existing.status,
        items: [],
        totals: { pieces: 0, rrp_brl: 0, skus_distinct: 0 },
        updated_at: existing.updated_at.toISOString(),
        etag: `"${existing.updated_at.getTime()}"`,
      };
    }

    const order = this.orders.create({
      tenant_id: tenantId,
      collection_id: dto.collection_id,
      store_id: dto.store_id,
      status: 'draft',
      created_by: userId,
    });
    const saved = await this.orders.save(order);

    return {
      id: saved.id,
      store_id: saved.store_id,
      collection_id: saved.collection_id,
      status: saved.status,
      items: [],
      totals: { pieces: 0, rrp_brl: 0, skus_distinct: 0 },
      updated_at: saved.updated_at.toISOString(),
      etag: `"${saved.updated_at.getTime()}"`,
    };
  }
}

