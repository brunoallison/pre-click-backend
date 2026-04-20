import type { Repository } from 'typeorm';
import { Order } from '../../../entities/order.entity.js';
import type { OrderStatus } from '../../../entities/order.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { UpdateOrderStatusInput, isValidTransition, type OrderOutput } from '../dto/orders.dto.js';

@Injectable()
export class UpdateOrderStatusTask extends Task<OrderOutput> {
  protected validations = [verifyBody(UpdateOrderStatusInput, true)];

  constructor(@Inject('OrderRepository') private readonly orders: Repository<Order>) {
    super();
  }

  async execute(input: BaseInput): Promise<OrderOutput> {
    const tenantId = input.headers.tenantId as string;
    const { id } = input.params as { id: string };
    const dto = input.body as UpdateOrderStatusInput;

    const order = await this.orders.findOne({ where: { id, tenant_id: tenantId } });
    if (!order) throw HttpError.NotFound('not_found', 'Pedido não encontrado');

    if (!isValidTransition(order.status, dto.status)) {
      throw HttpError.Unprocessable(
        'invalid_transition',
        `Transição inválida: ${order.status} → ${dto.status}`,
      );
    }

    order.status = dto.status as OrderStatus;
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
