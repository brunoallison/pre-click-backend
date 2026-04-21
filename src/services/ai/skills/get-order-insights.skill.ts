import type { DataSource } from 'typeorm';
import type { Skill, SkillContext } from '../skill.types.js';

interface GetOrderInsightsInput {
  order_id: string;
}

interface OrderInsights {
  order_id: string;
  total_pcs: number;
  total_rrp: number;
  items_count: number;
  required_missing: number;
  store_display_name: string | null;
  collection_code: string | null;
}

export function buildGetOrderInsightsSkill(dataSource: DataSource): Skill<GetOrderInsightsInput, OrderInsights | { error: string }> {
  return {
    name: 'get_order_insights',
    description:
      'Retorna insights de um pedido: total de peças, RRP, itens, produtos obrigatórios faltando.',
    sideEffect: 'read',
    inputSchema: {
      type: 'object',
      required: ['order_id'],
      properties: {
        order_id: { type: 'string', description: 'ID do pedido' },
      },
    },
    async handler(ctx: SkillContext, input: GetOrderInsightsInput): Promise<OrderInsights | { error: string }> {
      const qr = dataSource.createQueryRunner();
      try {
        await qr.connect();

        const orderRow = await qr.manager.query<
          Array<{
            order_id: string;
            tenant_id: string;
            store_display_name: string;
            collection_code: string;
          }>
        >(
          `SELECT o.id as order_id, o.tenant_id, s.display_name as store_display_name, c.code as collection_code
           FROM "order" o
           JOIN "store" s ON s.id = o.store_id
           JOIN "collection" c ON c.id = o.collection_id
           WHERE o.id = $1 AND o.tenant_id = $2`,
          [input.order_id, ctx.tenantId],
        );

        if (!orderRow.length) {
          return { error: 'Pedido não encontrado' };
        }

        const row = orderRow[0]!;

        // Agrega total de peças e RRP
        const aggRow = await qr.manager.query<
          Array<{ total_pcs: string; total_rrp: string; items_count: string }>
        >(
          `SELECT
             COALESCE(SUM(oi.multiplier * g.total_pieces), 0) AS total_pcs,
             COALESCE(SUM(oi.multiplier * g.total_pieces * p.rrp::numeric), 0) AS total_rrp,
             COUNT(oi.id) AS items_count
           FROM order_item oi
           JOIN grade g ON g.id = oi.grade_id
           JOIN product p ON p.id = oi.product_id
           WHERE oi.order_id = $1`,
          [input.order_id],
        );

        const agg = aggRow[0] ?? { total_pcs: '0', total_rrp: '0', items_count: '0' };

        // Conta obrigatórios faltando (required mas sem item no pedido)
        const orderInfoRows = await qr.manager.query<Array<{ collection_id: string; store_id: string }>>(
          `SELECT o.collection_id, o.store_id FROM "order" o WHERE o.id = $1`,
          [input.order_id],
        );
        const orderInfo = orderInfoRows[0];

        let requiredMissing = 0;
        if (orderInfo) {
          const storeRow = await qr.manager.query<Array<{ cluster: string | null }>>(
            `SELECT cluster FROM store WHERE id = $1`,
            [orderInfo.store_id],
          );
          const cluster = storeRow[0]?.cluster;

          if (cluster) {
            const missingRows = await qr.manager.query<Array<{ cnt: string }>>(
              `SELECT COUNT(p.id) AS cnt
               FROM product p
               JOIN product_cluster_availability pca ON pca.product_id = p.id
               WHERE p.collection_id = $1
                 AND p.removed_at IS NULL
                 AND pca.cluster = $2
                 AND pca.availability = 'required'
                 AND NOT EXISTS (
                   SELECT 1 FROM order_item oi
                   WHERE oi.order_id = $3 AND oi.product_id = p.id
                 )`,
              [orderInfo.collection_id, cluster, input.order_id],
            );
            requiredMissing = parseInt(missingRows[0]?.cnt ?? '0');
          }
        }

        return {
          order_id: input.order_id,
          total_pcs: parseInt(agg.total_pcs),
          total_rrp: parseFloat(agg.total_rrp),
          items_count: parseInt(agg.items_count),
          required_missing: requiredMissing,
          store_display_name: row.store_display_name,
          collection_code: row.collection_code,
        };
      } finally {
        await qr.release();
      }
    },
  };
}
