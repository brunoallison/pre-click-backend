import type { Repository } from 'typeorm';
import { Order } from '../entities/order.entity.js';
import { OrderItem } from '../entities/order-item.entity.js';
import { Inject, Injectable } from '../utils/di.js';

@Injectable()
export class BudgetAggregationService {
  constructor(
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('OrderItemRepository') private readonly items: Repository<OrderItem>,
  ) {}

  async tenantUsedBrl(tenantId: string, collectionId: string): Promise<number> {
    const row = await this.items.manager
      .createQueryBuilder()
      .select('SUM(oi.multiplier * g.total_pieces * CAST(p.rrp AS numeric))', 'total_rrp')
      .from('order_item', 'oi')
      .innerJoin('order', 'o', 'o.id = oi.order_id')
      .innerJoin('grade', 'g', 'g.id = oi.grade_id')
      .innerJoin('product', 'p', 'p.id = oi.product_id')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.collection_id = :collectionId', { collectionId })
      .andWhere('oi.multiplier > 0')
      .getRawOne<{ total_rrp: string | null }>();
    return Math.round(Number(row?.total_rrp ?? 0) * 100) / 100;
  }

  async usedByStore(tenantId: string, collectionId: string): Promise<Map<string, number>> {
    const rows = await this.items.manager
      .createQueryBuilder()
      .select('o.store_id', 'store_id')
      .addSelect('SUM(oi.multiplier * g.total_pieces * CAST(p.rrp AS numeric))', 'total_rrp')
      .from('order_item', 'oi')
      .innerJoin('order', 'o', 'o.id = oi.order_id')
      .innerJoin('grade', 'g', 'g.id = oi.grade_id')
      .innerJoin('product', 'p', 'p.id = oi.product_id')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.collection_id = :collectionId', { collectionId })
      .andWhere('oi.multiplier > 0')
      .groupBy('o.store_id')
      .getRawMany<{ store_id: string; total_rrp: string | null }>();
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.store_id, Math.round(Number(r.total_rrp ?? 0) * 100) / 100);
    }
    return map;
  }

  async piecesByStore(tenantId: string, collectionId: string): Promise<Map<string, number>> {
    const rows = await this.items.manager
      .createQueryBuilder()
      .select('o.store_id', 'store_id')
      .addSelect('SUM(oi.multiplier * g.total_pieces)', 'pieces')
      .from('order_item', 'oi')
      .innerJoin('order', 'o', 'o.id = oi.order_id')
      .innerJoin('grade', 'g', 'g.id = oi.grade_id')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.collection_id = :collectionId', { collectionId })
      .andWhere('oi.multiplier > 0')
      .groupBy('o.store_id')
      .getRawMany<{ store_id: string; pieces: string | null }>();
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.store_id, Number(r.pieces ?? 0));
    }
    return map;
  }
}
