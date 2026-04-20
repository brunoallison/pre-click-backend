import type { Repository } from 'typeorm';
import { Order } from '../../../entities/order.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyQuery } from '../../../utils/schema.js';
import { ListOrdersQuery, type Paginated, type OrderOutput } from '../dto/orders.dto.js';

@Injectable()
export class ListOrdersTask extends Task<Paginated<OrderOutput>> {
  protected validations = [verifyQuery(ListOrdersQuery)];

  constructor(@Inject('OrderRepository') private readonly orders: Repository<Order>) {
    super();
  }

  async execute(input: BaseInput): Promise<Paginated<OrderOutput>> {
    const tenantId = input.headers.tenantId as string;
    const q = input.query as ListOrdersQuery;

    const page = q.page ?? 1;
    const pageSize = q.page_size ?? 50;

    const qb = this.orders
      .createQueryBuilder('o')
      .where('o.tenant_id = :tenantId', { tenantId })
      .orderBy('o.updated_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (q.collection_id) qb.andWhere('o.collection_id = :cid', { cid: q.collection_id });
    if (q.store_id) qb.andWhere('o.store_id = :sid', { sid: q.store_id });
    if (q.status) qb.andWhere('o.status = :status', { status: q.status });

    const [rows, total] = await qb.getManyAndCount();

    const items: OrderOutput[] = rows.map((o) => ({
      id: o.id,
      store_id: o.store_id,
      collection_id: o.collection_id,
      status: o.status,
      items: [],
      totals: { pieces: 0, rrp_brl: 0, skus_distinct: 0 },
      updated_at: o.updated_at.toISOString(),
      etag: `"${o.updated_at.getTime()}"`,
    }));

    return { items, total, page, page_size: pageSize };
  }
}
