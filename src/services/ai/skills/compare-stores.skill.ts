import type { DataSource } from 'typeorm';
import type { Skill, SkillContext } from '../skill.types.js';

interface CompareStoresInput {
  store_a: string;
  store_b: string;
  collection_id?: string;
}

interface StoreComparison {
  store_a: { id: string; display_name: string; total_pcs: number; total_rrp: number };
  store_b: { id: string; display_name: string; total_pcs: number; total_rrp: number };
  shared_products: number;
  exclusive_to_a: number;
  exclusive_to_b: number;
}

export function buildCompareStoresSkill(dataSource: DataSource): Skill<CompareStoresInput, StoreComparison | { error: string }> {
  return {
    name: 'compare_stores',
    description:
      'Compara duas lojas lado a lado: total de peças, RRP, produtos compartilhados e exclusivos.',
    sideEffect: 'read',
    inputSchema: {
      type: 'object',
      required: ['store_a', 'store_b'],
      properties: {
        store_a: { type: 'string', description: 'ID da loja A' },
        store_b: { type: 'string', description: 'ID da loja B' },
        collection_id: { type: 'string', description: 'ID da coleção (opcional)' },
      },
    },
    async handler(ctx: SkillContext, input: CompareStoresInput): Promise<StoreComparison | { error: string }> {
      const qr = dataSource.createQueryRunner();
      try {
        await qr.connect();

        const collectionFilter = input.collection_id
          ? `AND o.collection_id = '${input.collection_id}'`
          : '';

        const getStoreAgg = async (storeId: string): Promise<{ display_name: string; total_pcs: number; total_rrp: number }> => {
          const nameRows = await qr.manager.query<Array<{ display_name: string; tenant_id: string }>>(
            `SELECT display_name, tenant_id FROM store WHERE id = $1`,
            [storeId],
          );
          if (!nameRows.length || nameRows[0]!.tenant_id !== ctx.tenantId) {
            return { display_name: 'Loja não encontrada', total_pcs: 0, total_rrp: 0 };
          }
          const rows = await qr.manager.query<Array<{ total_pcs: string; total_rrp: string }>>(
            `SELECT
               COALESCE(SUM(oi.multiplier * g.total_pieces), 0) AS total_pcs,
               COALESCE(SUM(oi.multiplier * g.total_pieces * p.rrp::numeric), 0) AS total_rrp
             FROM "order" o
             LEFT JOIN order_item oi ON oi.order_id = o.id
             LEFT JOIN grade g ON g.id = oi.grade_id
             LEFT JOIN product p ON p.id = oi.product_id
             WHERE o.store_id = $1 AND o.tenant_id = $2 ${collectionFilter}`,
            [storeId, ctx.tenantId],
          );
          return {
            display_name: nameRows[0]!.display_name,
            total_pcs: parseInt(rows[0]?.total_pcs ?? '0'),
            total_rrp: parseFloat(rows[0]?.total_rrp ?? '0'),
          };
        };

        const [aggA, aggB] = await Promise.all([
          getStoreAgg(input.store_a),
          getStoreAgg(input.store_b),
        ]);

        // Produtos de cada loja
        const getProductIds = async (storeId: string): Promise<Set<string>> => {
          const rows = await qr.manager.query<Array<{ product_id: string }>>(
            `SELECT DISTINCT oi.product_id
             FROM "order" o
             JOIN order_item oi ON oi.order_id = o.id
             WHERE o.store_id = $1 AND o.tenant_id = $2 ${collectionFilter}`,
            [storeId, ctx.tenantId],
          );
          return new Set(rows.map((r) => r.product_id));
        };

        const [idsA, idsB] = await Promise.all([
          getProductIds(input.store_a),
          getProductIds(input.store_b),
        ]);

        let shared = 0;
        let exclusiveA = 0;
        let exclusiveB = 0;

        for (const id of idsA) {
          if (idsB.has(id)) shared++;
          else exclusiveA++;
        }
        for (const id of idsB) {
          if (!idsA.has(id)) exclusiveB++;
        }

        return {
          store_a: { id: input.store_a, ...aggA },
          store_b: { id: input.store_b, ...aggB },
          shared_products: shared,
          exclusive_to_a: exclusiveA,
          exclusive_to_b: exclusiveB,
        };
      } finally {
        await qr.release();
      }
    },
  };
}
