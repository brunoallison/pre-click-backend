import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyParams } from '../../../utils/schema.js';
import { InsightsService } from '../../../services/insights.service.js';
import type { Repository } from 'typeorm';
import { Order } from '../../../entities/order.entity.js';
import { OrderInsightsParams, type OrderInsightsOutput } from '../dto/insights.dto.js';

@Injectable()
export class GetOrderInsightsTask extends Task<OrderInsightsOutput> {
  protected validations = [verifyParams(OrderInsightsParams)];

  constructor(
    @Inject(InsightsService) private readonly insights: InsightsService,
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<OrderInsightsOutput> {
    const tenantId = input.headers.tenantId as string;
    const { id } = input.params as OrderInsightsParams;

    const exists = await this.orders.findOne({ where: { id, tenant_id: tenantId } });
    if (!exists) throw HttpError.NotFound('order_not_found', 'Pedido não encontrado');

    const insights = await this.insights.forOrder(tenantId, id);
    return { insights };
  }
}
