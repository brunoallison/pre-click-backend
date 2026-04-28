import type { Repository } from 'typeorm';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyQuery } from '../../../utils/schema.js';
import { Order } from '../../../entities/order.entity.js';
import { SharesQueryInput, type ShareItem } from '../dto/dashboard.dto.js';

const RRP_BUCKET_EXPR = `CASE
  WHEN CAST(p.rrp AS numeric) < 100 THEN 'até R$ 99,99'
  WHEN CAST(p.rrp AS numeric) < 150 THEN 'R$ 100 – 149,99'
  WHEN CAST(p.rrp AS numeric) < 200 THEN 'R$ 150 – 199,99'
  WHEN CAST(p.rrp AS numeric) < 400 THEN 'R$ 200 – 399,99'
  WHEN CAST(p.rrp AS numeric) < 600 THEN 'R$ 400 – 599,99'
  WHEN CAST(p.rrp AS numeric) < 800 THEN 'R$ 600 – 799,99'
  WHEN CAST(p.rrp AS numeric) < 1000 THEN 'R$ 800 – 999,99'
  WHEN CAST(p.rrp AS numeric) < 1500 THEN 'R$ 1.000 – 1.499'
  ELSE 'R$ 1.500+'
END`;

/** Expressão SQL da dimensão para COALESCE/GROUP BY */
const DIMENSION_COLUMN: Record<string, string> = {
  category: 'p.category',
  gender: 'p.gender',
  prod_group: 'p.prod_group',
  division: 'p.division',
  sales_line: 'p.sales_line',
  rrp_bucket: RRP_BUCKET_EXPR,
};

@Injectable()
export class GetSharesTask extends Task<ShareItem[]> {
  protected validations = [verifyQuery(SharesQueryInput)];

  constructor(@Inject('OrderRepository') private readonly orders: Repository<Order>) {
    super();
  }

  async execute(input: BaseInput): Promise<ShareItem[]> {
    const tenantId = input.headers.tenantId as string;
    const {
      collection_id,
      dimension,
      division,
      metric = 'value',
    } = input.query as SharesQueryInput;

    const tenantOrders = await this.orders.find({
      where: { tenant_id: tenantId, collection_id },
    });
    const orderIds = tenantOrders.map((o) => o.id);
    if (orderIds.length === 0) return [];

    const dimCol = DIMENSION_COLUMN[dimension];
    // value = BRL (RRP × peças); qty = peças apenas
    const valueExpr =
      metric === 'qty'
        ? 'SUM(oi.multiplier * g.total_pieces)'
        : 'SUM(oi.multiplier * g.total_pieces * CAST(p.rrp AS numeric))';
    // Faixa de preço ordena pelo piso da faixa (crescente); demais dimensões por valor (desc)
    const isRrpBucket = dimension === 'rrp_bucket';
    const orderExpr = isRrpBucket ? 'MIN(CAST(p.rrp AS numeric))' : 'value';
    const orderDir = isRrpBucket ? 'ASC' : 'DESC';

    // Filtro de division aplicado em todas as dimensões EXCETO quando a própria
    // dimensão é division (a card precisa continuar listando todas as opções pra clicar)
    const applyDivisionFilter = division && dimension !== 'division';

    const qb = this.orders.manager
      .createQueryBuilder()
      .select([`COALESCE(${dimCol}, '(sem categoria)') AS label`, `${valueExpr} AS value`])
      .from('order_item', 'oi')
      .innerJoin('grade', 'g', 'g.id = oi.grade_id')
      .innerJoin('product', 'p', 'p.id = oi.product_id')
      .where('oi.order_id IN (:...orderIds)', { orderIds })
      .andWhere('oi.multiplier > 0');

    if (applyDivisionFilter) {
      qb.andWhere('p.division = :division', { division });
    }

    const rows = await qb
      .groupBy('label')
      .orderBy(orderExpr, orderDir)
      .getRawMany<{ label: string; value: string }>();

    const total = rows.reduce((s, r) => s + Number(r.value), 0);
    const isQty = metric === 'qty';

    return rows.map((r) => ({
      label: r.label,
      pct: total > 0 ? Math.round((Number(r.value) / total) * 1000) / 10 : 0,
      // qty é inteiro; brl tem 2 casas
      value: isQty ? Math.round(Number(r.value)) : Math.round(Number(r.value) * 100) / 100,
    }));
  }
}
