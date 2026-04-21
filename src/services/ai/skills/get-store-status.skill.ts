import type { DataSource } from 'typeorm';
import type { Skill, SkillContext } from '../skill.types.js';

interface GetStoreStatusInput {
  store_id: string;
  collection_id?: string;
}

interface StoreStatus {
  store_id: string;
  display_name: string;
  cluster: string | null;
  total_pcs: number;
  total_rrp: number;
  items_count: number;
  budget_brl: number | null;
  budget_used_pct: number | null;
}

export function buildGetStoreStatusSkill(
  dataSource: DataSource,
): Skill<GetStoreStatusInput, StoreStatus | { error: string }> {
  return {
    name: 'get_store_status',
    description:
      'Retorna status atual de uma loja: nome, cluster, total de peças, RRP e uso de budget.',
    sideEffect: 'read',
    inputSchema: {
      type: 'object',
      required: ['store_id'],
      properties: {
        store_id: { type: 'string', description: 'ID da loja' },
        collection_id: { type: 'string', description: 'ID da coleção (opcional)' },
      },
    },
    async handler(
      ctx: SkillContext,
      input: GetStoreStatusInput,
    ): Promise<StoreStatus | { error: string }> {
      const qr = dataSource.createQueryRunner();
      try {
        await qr.connect();

        const storeRows = await qr.manager.query<
          Array<{ id: string; display_name: string; cluster: string | null; tenant_id: string }>
        >(`SELECT id, display_name, cluster, tenant_id FROM store WHERE id = $1`, [input.store_id]);

        if (!storeRows.length || storeRows[0]!.tenant_id !== ctx.tenantId) {
          return { error: 'Loja não encontrada' };
        }

        const store = storeRows[0]!;

        const params: unknown[] = [input.store_id, ctx.tenantId];
        let collectionFilter = '';
        if (input.collection_id) {
          params.push(input.collection_id);
          collectionFilter = `AND o.collection_id = $${params.length}`;
        }

        const aggRows = await qr.manager.query<
          Array<{ total_pcs: string; total_rrp: string; items_count: string }>
        >(
          `SELECT
             COALESCE(SUM(oi.multiplier * g.total_pieces), 0) AS total_pcs,
             COALESCE(SUM(oi.multiplier * g.total_pieces * p.rrp::numeric), 0) AS total_rrp,
             COUNT(oi.id) AS items_count
           FROM "order" o
           LEFT JOIN order_item oi ON oi.order_id = o.id
           LEFT JOIN grade g ON g.id = oi.grade_id
           LEFT JOIN product p ON p.id = oi.product_id
           WHERE o.store_id = $1 AND o.tenant_id = $2 ${collectionFilter}`,
          params,
        );

        const agg = aggRows[0] ?? { total_pcs: '0', total_rrp: '0', items_count: '0' };

        let budgetBrl: number | null = null;
        let budgetUsedPct: number | null = null;
        if (input.collection_id) {
          const budgetRows = await qr.manager.query<Array<{ amount_brl: string }>>(
            `SELECT amount_brl FROM store_budget WHERE store_id = $1 AND collection_id = $2`,
            [input.store_id, input.collection_id],
          );
          if (budgetRows.length && budgetRows[0]!.amount_brl) {
            budgetBrl = parseFloat(budgetRows[0]!.amount_brl);
            const totalRrp = parseFloat(agg.total_rrp);
            budgetUsedPct = budgetBrl > 0 ? Math.round((totalRrp / budgetBrl) * 100) : null;
          }
        }

        return {
          store_id: input.store_id,
          display_name: store.display_name,
          cluster: store.cluster,
          total_pcs: parseInt(agg.total_pcs),
          total_rrp: parseFloat(agg.total_rrp),
          items_count: parseInt(agg.items_count),
          budget_brl: budgetBrl,
          budget_used_pct: budgetUsedPct,
        };
      } finally {
        await qr.release();
      }
    },
  };
}
