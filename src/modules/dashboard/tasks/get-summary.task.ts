import type { Repository } from 'typeorm';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyQuery } from '../../../utils/schema.js';
import { Order } from '../../../entities/order.entity.js';
import { OrderItem } from '../../../entities/order-item.entity.js';
import { Store } from '../../../entities/store.entity.js';
import { TenantBudget } from '../../../entities/tenant-budget.entity.js';
import { DashboardQueryInput, type DashboardSummaryOutput } from '../dto/dashboard.dto.js';

@Injectable()
export class GetSummaryTask extends Task<DashboardSummaryOutput> {
  protected validations = [verifyQuery(DashboardQueryInput)];

  constructor(
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('OrderItemRepository') private readonly orderItems: Repository<OrderItem>,
    @Inject('StoreRepository') private readonly stores: Repository<Store>,
    @Inject('TenantBudgetRepository') private readonly budgets: Repository<TenantBudget>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<DashboardSummaryOutput> {
    const tenantId = input.headers.tenantId as string;
    const { collection_id } = input.query as DashboardQueryInput;

    // Pedidos do tenant na coleção
    const tenantOrders = await this.orders.find({
      where: { tenant_id: tenantId, collection_id },
    });
    const orderIds = tenantOrders.map((o) => o.id);

    // Lojas ativas do tenant
    const activeStores = await this.stores.find({
      where: { tenant_id: tenantId, is_active: true, is_dummy: false },
    });

    if (orderIds.length === 0) {
      return {
        total_pieces: 0,
        total_rrp: 0,
        skus_distinct: 0,
        stores_count: activeStores.length,
        orders_count: 0,
        budget_used_pct: null,
      };
    }

    // Agregar via query nativa para performance
    const result = await this.orderItems.manager
      .createQueryBuilder()
      .select([
        'SUM(oi.multiplier * g.total_pieces) AS total_pieces',
        'SUM(oi.multiplier * g.total_pieces * CAST(p.rrp AS numeric)) AS total_rrp',
        'COUNT(DISTINCT oi.product_id) AS skus_distinct',
      ])
      .from('order_item', 'oi')
      .innerJoin('grade', 'g', 'g.id = oi.grade_id')
      .innerJoin('product', 'p', 'p.id = oi.product_id')
      .where('oi.order_id IN (:...orderIds)', { orderIds })
      .andWhere('oi.multiplier > 0')
      .getRawOne<{ total_pieces: string; total_rrp: string; skus_distinct: string }>();

    const totalPieces = Number(result?.total_pieces ?? 0);
    const totalRrp = Number(result?.total_rrp ?? 0);
    const skusDistinct = Number(result?.skus_distinct ?? 0);

    // Budget
    const budget = await this.budgets.findOne({
      where: { tenant_id: tenantId, collection_id },
    });
    const budgetUsedPct =
      budget && Number(budget.amount_brl) > 0 ? (totalRrp / Number(budget.amount_brl)) * 100 : null;

    return {
      total_pieces: totalPieces,
      total_rrp: totalRrp,
      skus_distinct: skusDistinct,
      stores_count: activeStores.length,
      orders_count: tenantOrders.length,
      budget_used_pct: budgetUsedPct !== null ? Math.round(budgetUsedPct * 10) / 10 : null,
    };
  }
}
