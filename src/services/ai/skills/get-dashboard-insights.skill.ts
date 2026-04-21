import type { DataSource } from 'typeorm';
import type { Skill, SkillContext } from '../skill.types.js';

interface GetDashboardInsightsInput {
  collection_id?: string;
}

interface StoreVolume {
  store_display_name: string;
  total_pcs: number;
  total_rrp: number;
}

interface DashboardInsights {
  total_pcs: number;
  total_rrp: number;
  orders_count: number;
  stores_count: number;
  top5_stores: StoreVolume[];
}

export function buildGetDashboardInsightsSkill(dataSource: DataSource): Skill<GetDashboardInsightsInput, DashboardInsights | { error: string }> {
  return {
    name: 'get_dashboard_insights',
    description:
      'Retorna visão geral do dashboard: totais de peças, RRP, contagem de pedidos e lojas, top 5 lojas por volume.',
    sideEffect: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        collection_id: { type: 'string', description: 'ID da coleção (opcional)' },
      },
    },
    async handler(ctx: SkillContext, input: GetDashboardInsightsInput): Promise<DashboardInsights | { error: string }> {
      const qr = dataSource.createQueryRunner();
      try {
        await qr.connect();

        const params: unknown[] = [ctx.tenantId];
        let collectionFilter = '';
        if (input.collection_id) {
          params.push(input.collection_id);
          collectionFilter = `AND o.collection_id = $${params.length}`;
        }

        const totalRows = await qr.manager.query<
          Array<{
            total_pcs: string;
            total_rrp: string;
            orders_count: string;
            stores_count: string;
          }>
        >(
          `SELECT
             COALESCE(SUM(oi.multiplier * g.total_pieces), 0) AS total_pcs,
             COALESCE(SUM(oi.multiplier * g.total_pieces * p.rrp::numeric), 0) AS total_rrp,
             COUNT(DISTINCT o.id) AS orders_count,
             COUNT(DISTINCT o.store_id) AS stores_count
           FROM "order" o
           LEFT JOIN order_item oi ON oi.order_id = o.id
           LEFT JOIN grade g ON g.id = oi.grade_id
           LEFT JOIN product p ON p.id = oi.product_id
           WHERE o.tenant_id = $1 ${collectionFilter}`,
          params,
        );

        const agg = totalRows[0] ?? {
          total_pcs: '0',
          total_rrp: '0',
          orders_count: '0',
          stores_count: '0',
        };

        const top5Rows = await qr.manager.query<
          Array<{ store_display_name: string; total_pcs: string; total_rrp: string }>
        >(
          `SELECT
             s.display_name AS store_display_name,
             COALESCE(SUM(oi.multiplier * g.total_pieces), 0) AS total_pcs,
             COALESCE(SUM(oi.multiplier * g.total_pieces * p.rrp::numeric), 0) AS total_rrp
           FROM "order" o
           JOIN store s ON s.id = o.store_id
           LEFT JOIN order_item oi ON oi.order_id = o.id
           LEFT JOIN grade g ON g.id = oi.grade_id
           LEFT JOIN product p ON p.id = oi.product_id
           WHERE o.tenant_id = $1 ${collectionFilter}
           GROUP BY s.id, s.display_name
           ORDER BY total_pcs DESC
           LIMIT 5`,
          params,
        );

        return {
          total_pcs: parseInt(agg.total_pcs),
          total_rrp: parseFloat(agg.total_rrp),
          orders_count: parseInt(agg.orders_count),
          stores_count: parseInt(agg.stores_count),
          top5_stores: top5Rows.map((r) => ({
            store_display_name: r.store_display_name,
            total_pcs: parseInt(r.total_pcs),
            total_rrp: parseFloat(r.total_rrp),
          })),
        };
      } finally {
        await qr.release();
      }
    },
  };
}
