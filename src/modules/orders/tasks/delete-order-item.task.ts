import type { Repository } from 'typeorm';
import { Order } from '../../../entities/order.entity.js';
import { OrderItem } from '../../../entities/order-item.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';

@Injectable()
export class DeleteOrderItemTask extends Task<null> {
  constructor(
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('OrderItemRepository') private readonly items: Repository<OrderItem>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<null> {
    const tenantId = input.headers.tenantId as string;
    const { id, itemId } = input.params as { id: string; itemId: string };

    // Verifica ownership do pedido
    const order = await this.orders.findOne({ where: { id, tenant_id: tenantId } });
    if (!order) throw HttpError.NotFound('not_found', 'Pedido não encontrado');

    // Verifica ownership do item
    const item = await this.items.findOne({
      where: { id: itemId, order_id: id, tenant_id: tenantId },
    });
    if (!item) throw HttpError.NotFound('not_found', 'Item não encontrado');

    await this.items.delete({ id: itemId });
    // Toca updated_at do pedido pai — coerente com upsert-order-item.
    await this.orders.update({ id }, { updated_at: new Date() });
    return null;
  }
}
