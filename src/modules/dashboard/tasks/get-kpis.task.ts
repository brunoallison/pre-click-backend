import type { Repository } from 'typeorm';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyQuery } from '../../../utils/schema.js';
import { Order } from '../../../entities/order.entity.js';
import { Store } from '../../../entities/store.entity.js';
import { AiCall } from '../../../entities/ai-call.entity.js';
import { KpisQueryInput, type DashboardKpisOutput } from '../dto/dashboard.dto.js';

@Injectable()
export class GetKpisTask extends Task<DashboardKpisOutput> {
  protected validations = [verifyQuery(KpisQueryInput)];

  constructor(
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('StoreRepository') private readonly stores: Repository<Store>,
    @Inject('AiCallRepository') private readonly aiCalls: Repository<AiCall>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<DashboardKpisOutput> {
    const tenantId = input.headers.tenantId as string;
    const { collection_id, prev_collection_id } = input.query as KpisQueryInput;

    // Pedidos da coleção atual
    const tenantOrders = await this.orders.find({
      where: { tenant_id: tenantId, collection_id },
    });
    const orderIds = tenantOrders.map((o) => o.id);

    // Lojas ativas (não dummy)
    const activeStores = await this.stores.find({
      where: { tenant_id: tenantId, is_active: true, is_dummy: false },
    });
    const orderedStoreIds = new Set(tenantOrders.map((o) => o.store_id));
    const missingOrdersCount = activeStores.filter((s) => !orderedStoreIds.has(s.id)).length;

    // Totais da coleção atual
    let totalPieces = 0;
    let totalRrp = 0;

    if (orderIds.length > 0) {
      const result = await this.orders.manager
        .createQueryBuilder()
        .select([
          'SUM(oi.multiplier * g.total_pieces) AS total_pieces',
          'SUM(oi.multiplier * g.total_pieces * CAST(p.rrp AS numeric)) AS total_rrp',
        ])
        .from('order_item', 'oi')
        .innerJoin('grade', 'g', 'g.id = oi.grade_id')
        .innerJoin('product', 'p', 'p.id = oi.product_id')
        .where('oi.order_id IN (:...orderIds)', { orderIds })
        .andWhere('oi.multiplier > 0')
        .getRawOne<{ total_pieces: string; total_rrp: string }>();

      totalPieces = Number(result?.total_pieces ?? 0);
      totalRrp = Number(result?.total_rrp ?? 0);
    }

    // Contagem de sugestões IA (suggest_grade) feitas pelo tenant
    const aiSuggestionsCount = await this.aiCalls.count({
      where: {
        tenant_id: tenantId,
        kind: 'suggest_grade',
      },
    });

    // Deltas vs coleção anterior (opcional): variação percentual ((curr - prev) / prev) * 100
    let deltaPiecesPct: number | null = null;
    let deltaRrpPct: number | null = null;

    if (prev_collection_id) {
      const prevOrders = await this.orders.find({
        where: { tenant_id: tenantId, collection_id: prev_collection_id },
      });
      const prevOrderIds = prevOrders.map((o) => o.id);

      if (prevOrderIds.length > 0) {
        const prevResult = await this.orders.manager
          .createQueryBuilder()
          .select([
            'SUM(oi.multiplier * g.total_pieces) AS total_pieces',
            'SUM(oi.multiplier * g.total_pieces * CAST(p.rrp AS numeric)) AS total_rrp',
          ])
          .from('order_item', 'oi')
          .innerJoin('grade', 'g', 'g.id = oi.grade_id')
          .innerJoin('product', 'p', 'p.id = oi.product_id')
          .where('oi.order_id IN (:...prevOrderIds)', { prevOrderIds })
          .andWhere('oi.multiplier > 0')
          .getRawOne<{ total_pieces: string; total_rrp: string }>();

        const prevPieces = Number(prevResult?.total_pieces ?? 0);
        const prevRrp = Number(prevResult?.total_rrp ?? 0);
        if (prevPieces > 0) {
          deltaPiecesPct = Math.round(((totalPieces - prevPieces) / prevPieces) * 10000) / 100;
        }
        if (prevRrp > 0) {
          deltaRrpPct = Math.round(((totalRrp - prevRrp) / prevRrp) * 10000) / 100;
        }
      }
    }

    return {
      total_pieces: { value: totalPieces, delta_pct_vs_previous: deltaPiecesPct },
      total_rrp_brl: {
        value: Math.round(totalRrp * 100) / 100,
        delta_pct_vs_previous: deltaRrpPct,
      },
      missing_orders_count: missingOrdersCount,
      ai_suggestions_count: aiSuggestionsCount,
      // ai_call não persiste confidence ainda — requer nova coluna para computar
      ai_avg_confidence_pct: null,
    };
  }
}
