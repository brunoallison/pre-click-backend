import type { Repository } from 'typeorm';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyQuery } from '../../../utils/schema.js';
import { Order } from '../../../entities/order.entity.js';
import { SharesQueryInput, type ShareItem } from '../dto/dashboard.dto.js';

/** Colunas do produto mapeadas por dimensão */
const DIMENSION_COLUMN: Record<string, string> = {
  category: 'p.category',
  gender: 'p.gender',
  prod_group: 'p.prod_group',
  division: 'p.division',
};

@Injectable()
export class GetSharesTask extends Task<ShareItem[]> {
  protected validations = [verifyQuery(SharesQueryInput)];

  constructor(@Inject('OrderRepository') private readonly orders: Repository<Order>) {
    super();
  }

  async execute(input: BaseInput): Promise<ShareItem[]> {
    const tenantId = input.headers.tenantId as string;
    const { collection_id, dimension } = input.query as SharesQueryInput;

    const tenantOrders = await this.orders.find({
      where: { tenant_id: tenantId, collection_id },
    });
    const orderIds = tenantOrders.map((o) => o.id);
    if (orderIds.length === 0) return [];

    const dimCol = DIMENSION_COLUMN[dimension];

    const rows = await this.orders.manager
      .createQueryBuilder()
      .select([
        `COALESCE(${dimCol}, '(sem categoria)') AS label`,
        'SUM(oi.multiplier * g.total_pieces * CAST(p.rrp AS numeric)) AS value_brl',
      ])
      .from('order_item', 'oi')
      .innerJoin('grade', 'g', 'g.id = oi.grade_id')
      .innerJoin('product', 'p', 'p.id = oi.product_id')
      .where('oi.order_id IN (:...orderIds)', { orderIds })
      .andWhere('oi.multiplier > 0')
      .groupBy('label')
      .orderBy('value_brl', 'DESC')
      .getRawMany<{ label: string; value_brl: string }>();

    const totalBrl = rows.reduce((s, r) => s + Number(r.value_brl), 0);

    return rows.map((r) => ({
      label: r.label,
      pct: totalBrl > 0 ? Math.round((Number(r.value_brl) / totalBrl) * 1000) / 10 : 0,
      value_brl: Math.round(Number(r.value_brl) * 100) / 100,
    }));
  }
}
