import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { Repository } from 'typeorm';
import { container } from 'tsyringe';
import { Order } from '../../../entities/order.entity.js';
import { OrderItem } from '../../../entities/order-item.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { OrderExpansionService } from '../../../services/order-expansion.service.js';
import type { OrderOutput } from '../dto/orders.dto.js';

@Injectable()
export class GetOrderTask extends Task<OrderOutput> {
  constructor(
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('OrderItemRepository') private readonly items: Repository<OrderItem>,
    @Inject(OrderExpansionService) private readonly expansion: OrderExpansionService,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<OrderOutput> {
    const tenantId = input.headers.tenantId as string;
    const { id } = input.params as { id: string };

    const order = await this.orders.findOne({ where: { id, tenant_id: tenantId } });
    if (!order) throw HttpError.NotFound('not_found', 'Pedido não encontrado');

    const orderItems = await this.items.find({ where: { order_id: id, tenant_id: tenantId } });
    const itemOutputs = await this.expansion.toOutputList(orderItems);

    const pieces = itemOutputs.reduce((s, i) => s + i.expanded_qty, 0);
    const skusDistinct = new Set(itemOutputs.map((i) => i.product_id)).size;
    const etag = `"${order.updated_at.getTime()}"`;

    return {
      id: order.id,
      store_id: order.store_id,
      collection_id: order.collection_id,
      batch_id: order.batch_id,
      status: order.status,
      items: itemOutputs,
      totals: { pieces, rrp_brl: 0, skus_distinct: skusDistinct },
      updated_at: order.updated_at.toISOString(),
      etag,
    };
  }

  /** Handler com suporte a ETag / 304. */
  public static handlerWithEtag(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const task = container.resolve(GetOrderTask);
        const result = await task.execute(task['buildInput'](req));
        res.setHeader('ETag', result.etag);
        if (req.headers['if-none-match'] === result.etag) {
          res.status(304).end();
          return;
        }
        res.json(result);
      } catch (err) {
        next(err);
      }
    };
  }
}
