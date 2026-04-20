import type { Repository } from 'typeorm';
import { Order } from '../../../entities/order.entity.js';
import { OrderItem } from '../../../entities/order-item.entity.js';
import { Product } from '../../../entities/product.entity.js';
import { StoreBudget } from '../../../entities/store-budget.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { OrderExpansionService } from '../../../services/order-expansion.service.js';
import type { OrderSummaryOutput } from '../dto/orders.dto.js';

@Injectable()
export class GetOrderSummaryTask extends Task<OrderSummaryOutput> {
  constructor(
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('OrderItemRepository') private readonly items: Repository<OrderItem>,
    @Inject('ProductRepository') private readonly products: Repository<Product>,
    @Inject('StoreBudgetRepository') private readonly budgets: Repository<StoreBudget>,
    private readonly expansion: OrderExpansionService,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<OrderSummaryOutput> {
    const tenantId = input.headers.tenantId as string;
    const { id } = input.params as { id: string };

    const order = await this.orders.findOne({ where: { id, tenant_id: tenantId } });
    if (!order) throw HttpError.NotFound('not_found', 'Pedido não encontrado');

    const orderItems = await this.items.find({ where: { order_id: id, tenant_id: tenantId } });
    if (orderItems.length === 0) {
      return {
        total_pieces: 0,
        total_rrp_brl: 0,
        skus_distinct: 0,
        budget_used_brl: 0,
        budget_used_pct: null,
      };
    }

    const gradeIds = [...new Set(orderItems.map((i) => i.grade_id))];
    const totals = await this.expansion.gradeQtyTotals(gradeIds);

    // Busca produtos para calcular RRP
    const productIds = [...new Set(orderItems.map((i) => i.product_id))];
    const productRows = await this.products.findByIds(productIds);
    const rrpByProduct = new Map<string, number>(
      productRows.map((p) => [p.id, parseFloat(p.rrp)]),
    );

    let totalPieces = 0;
    let totalRrp = 0;
    const skusSet = new Set<string>();

    for (const item of orderItems) {
      if (item.multiplier <= 0) continue;
      const gradeQty = totals.get(item.grade_id) ?? 0;
      const expanded = item.multiplier * gradeQty;
      const rrp = rrpByProduct.get(item.product_id) ?? 0;
      totalPieces += expanded;
      totalRrp += expanded * rrp;
      skusSet.add(item.product_id);
    }

    const budget = await this.budgets.findOne({
      where: { store_id: order.store_id, collection_id: order.collection_id, tenant_id: tenantId },
    });
    const budgetAmount = budget ? parseFloat(budget.amount_brl) : null;
    const budgetUsedPct = budgetAmount && budgetAmount > 0 ? (totalRrp / budgetAmount) * 100 : null;

    return {
      total_pieces: totalPieces,
      total_rrp_brl: Math.round(totalRrp * 100) / 100,
      skus_distinct: skusSet.size,
      budget_used_brl: Math.round(totalRrp * 100) / 100,
      budget_used_pct: budgetUsedPct !== null ? Math.round(budgetUsedPct * 100) / 100 : null,
    };
  }
}
