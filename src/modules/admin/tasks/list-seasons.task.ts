import type { Repository } from 'typeorm';
import { Collection } from '../../../entities/collection.entity.js';
import { ImportBase } from '../../../entities/import-base.entity.js';
import { Order } from '../../../entities/order.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task } from '../../../utils/task.js';

export type SeasonStatus = 'next' | 'open' | 'delivery' | 'closed';

interface SeasonOutput {
  collection_id: string;
  code: string;
  country: string;
  status: SeasonStatus;
  order_window: { start: string | null; end: string | null };
  delivery_window: { start: string | null; end: string | null };
  latest_version: { tag: string; date: string; by: string } | null;
  counts: { versions: number; tenants_with_orders: number; open_orders: number };
}

function resolveStatus(col: Collection, now: Date): SeasonStatus {
  if (col.status === 'closed') return 'closed';
  const orderStart = col.order_start_at?.getTime();
  const orderEnd = col.order_end_at?.getTime();
  const deliveryEnd = col.delivery_end_at?.getTime();
  const t = now.getTime();

  if (orderStart !== undefined && t < orderStart) return 'next';
  if (orderEnd !== undefined && t <= orderEnd) return 'open';
  if (deliveryEnd !== undefined && t <= deliveryEnd) return 'delivery';
  if (deliveryEnd !== undefined && t > deliveryEnd) return 'closed';
  // datas nulas → respeita status persistido (draft → next, open → open)
  return col.status === 'open' ? 'open' : 'next';
}

@Injectable()
export class ListSeasonsTask extends Task<SeasonOutput[]> {
  constructor(
    @Inject('CollectionRepository') private readonly collections: Repository<Collection>,
    @Inject('ImportBaseRepository') private readonly imports: Repository<ImportBase>,
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
  ) {
    super();
  }

  async execute(): Promise<SeasonOutput[]> {
    const cols = await this.collections.find({ order: { code: 'DESC', country: 'ASC' } });
    if (cols.length === 0) return [];

    const collectionIds = cols.map((c) => c.id);

    const [latestImports, versionCounts, orderCounts] = await Promise.all([
      this.imports
        .createQueryBuilder('ib')
        .leftJoinAndSelect('ib.uploaded_by_user', 'u')
        .where('ib.collection_id IN (:...ids)', { ids: collectionIds })
        .andWhere('ib.status = :status', { status: 'completed' })
        .orderBy('ib.collection_id')
        .addOrderBy('ib.uploaded_at', 'DESC')
        .getMany(),
      this.imports
        .createQueryBuilder('ib')
        .select('ib.collection_id', 'collection_id')
        .addSelect('COUNT(*)::int', 'count')
        .where('ib.collection_id IN (:...ids)', { ids: collectionIds })
        .andWhere('ib.status = :status', { status: 'completed' })
        .groupBy('ib.collection_id')
        .getRawMany<{ collection_id: string; count: number }>(),
      this.orders
        .createQueryBuilder('o')
        .select('o.collection_id', 'collection_id')
        .addSelect('COUNT(*)::int', 'open_orders')
        .addSelect('COUNT(DISTINCT o.tenant_id)::int', 'tenants_with_orders')
        .where('o.collection_id IN (:...ids)', { ids: collectionIds })
        .andWhere("o.status IN ('draft', 'submitted')")
        .groupBy('o.collection_id')
        .getRawMany<{
          collection_id: string;
          open_orders: number;
          tenants_with_orders: number;
        }>(),
    ]);

    const latestByCollection = new Map<string, ImportBase>();
    for (const ib of latestImports) {
      if (!latestByCollection.has(ib.collection_id)) {
        latestByCollection.set(ib.collection_id, ib);
      }
    }

    const versionCountByCollection = new Map<string, number>();
    for (const r of versionCounts) versionCountByCollection.set(r.collection_id, r.count);

    const orderCountByCollection = new Map<
      string,
      { open_orders: number; tenants_with_orders: number }
    >();
    for (const r of orderCounts) {
      orderCountByCollection.set(r.collection_id, {
        open_orders: r.open_orders,
        tenants_with_orders: r.tenants_with_orders,
      });
    }

    const now = new Date();

    return cols.map((c) => {
      const latest = latestByCollection.get(c.id);
      const orders = orderCountByCollection.get(c.id);
      return {
        collection_id: c.id,
        code: c.code,
        country: c.country,
        status: resolveStatus(c, now),
        order_window: {
          start: c.order_start_at ? c.order_start_at.toISOString() : null,
          end: c.order_end_at ? c.order_end_at.toISOString() : null,
        },
        delivery_window: {
          start: c.delivery_start_at ? c.delivery_start_at.toISOString() : null,
          end: c.delivery_end_at ? c.delivery_end_at.toISOString() : null,
        },
        latest_version: latest
          ? {
              tag: latest.version_tag,
              date: latest.uploaded_at.toISOString(),
              by: latest.uploaded_by_user?.display_name ?? 'super_admin',
            }
          : null,
        counts: {
          versions: versionCountByCollection.get(c.id) ?? 0,
          tenants_with_orders: orders?.tenants_with_orders ?? 0,
          open_orders: orders?.open_orders ?? 0,
        },
      };
    });
  }
}
