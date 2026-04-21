import type { DataSource } from 'typeorm';
import type { Skill, SkillContext } from '../skill.types.js';

interface ExplainInsightInput {
  topic: string;
  collection_id?: string;
  store_id?: string;
}

interface ExplainInsightOutput {
  topic: string;
  data: Record<string, unknown>;
}

export function buildExplainInsightSkill(dataSource: DataSource): Skill<ExplainInsightInput, ExplainInsightOutput | { error: string }> {
  return {
    name: 'explain_insight',
    description:
      'Retorna dados brutos sobre um tópico (ex: obrigatórios, budget, RDD) para o LLM gerar uma explicação.',
    sideEffect: 'read',
    inputSchema: {
      type: 'object',
      required: ['topic'],
      properties: {
        topic: {
          type: 'string',
          description:
            'Tópico a explicar: "required_missing" | "budget_status" | "rdd_coverage" | "division_mix"',
        },
        collection_id: { type: 'string', description: 'ID da coleção (opcional)' },
        store_id: { type: 'string', description: 'ID da loja (opcional)' },
      },
    },
    async handler(ctx: SkillContext, input: ExplainInsightInput): Promise<ExplainInsightOutput | { error: string }> {
      const qr = dataSource.createQueryRunner();
      try {
        await qr.connect();

        const params: unknown[] = [ctx.tenantId];
        const colFilter = input.collection_id
          ? (() => { params.push(input.collection_id); return `AND o.collection_id = $${params.length}`; })()
          : '';
        const storeFilter = input.store_id
          ? (() => { params.push(input.store_id); return `AND o.store_id = $${params.length}`; })()
          : '';

        let data: Record<string, unknown> = {};

        switch (input.topic) {
          case 'required_missing': {
            const rows = await qr.manager.query<Array<{ store_display_name: string; missing: string }>>(
              `SELECT s.display_name AS store_display_name, COUNT(DISTINCT p.id) AS missing
               FROM "order" o
               JOIN store s ON s.id = o.store_id
               JOIN product p ON p.collection_id = o.collection_id AND p.removed_at IS NULL
               JOIN product_cluster_availability pca ON pca.product_id = p.id AND pca.cluster = s.cluster AND pca.availability = 'required'
               WHERE o.tenant_id = $1 ${colFilter} ${storeFilter}
                 AND NOT EXISTS (
                   SELECT 1 FROM order_item oi WHERE oi.order_id = o.id AND oi.product_id = p.id
                 )
               GROUP BY s.id, s.display_name
               ORDER BY missing DESC
               LIMIT 10`,
              params,
            );
            data = { stores_with_missing: rows.map((r) => ({ store: r.store_display_name, missing: parseInt(r.missing) })) };
            break;
          }
          case 'budget_status': {
            const rows = await qr.manager.query<
              Array<{ store_display_name: string; used_brl: string; budget_brl: string | null }>
            >(
              `SELECT s.display_name AS store_display_name,
                 COALESCE(SUM(oi.multiplier * g.total_pieces * p.rrp::numeric), 0) AS used_brl,
                 sb.amount_brl AS budget_brl
               FROM "order" o
               JOIN store s ON s.id = o.store_id
               LEFT JOIN order_item oi ON oi.order_id = o.id
               LEFT JOIN grade g ON g.id = oi.grade_id
               LEFT JOIN product p ON p.id = oi.product_id
               LEFT JOIN store_budget sb ON sb.store_id = o.store_id AND sb.collection_id = o.collection_id
               WHERE o.tenant_id = $1 ${colFilter} ${storeFilter}
               GROUP BY s.id, s.display_name, sb.amount_brl
               ORDER BY used_brl DESC
               LIMIT 10`,
              params,
            );
            data = {
              stores: rows.map((r) => ({
                store: r.store_display_name,
                used_brl: parseFloat(r.used_brl),
                budget_brl: r.budget_brl ? parseFloat(r.budget_brl) : null,
                pct: r.budget_brl ? Math.round((parseFloat(r.used_brl) / parseFloat(r.budget_brl)) * 100) : null,
              })),
            };
            break;
          }
          case 'division_mix': {
            const rows = await qr.manager.query<Array<{ division: string; total_pcs: string; total_rrp: string }>>(
              `SELECT p.division,
                 SUM(oi.multiplier * g.total_pieces) AS total_pcs,
                 SUM(oi.multiplier * g.total_pieces * p.rrp::numeric) AS total_rrp
               FROM "order" o
               JOIN order_item oi ON oi.order_id = o.id
               JOIN grade g ON g.id = oi.grade_id
               JOIN product p ON p.id = oi.product_id
               WHERE o.tenant_id = $1 ${colFilter} ${storeFilter}
               GROUP BY p.division
               ORDER BY total_pcs DESC`,
              params,
            );
            data = {
              division_mix: rows.map((r) => ({
                division: r.division,
                total_pcs: parseInt(r.total_pcs),
                total_rrp: parseFloat(r.total_rrp),
              })),
            };
            break;
          }
          default: {
            return { error: `Tópico '${input.topic}' não suportado. Use: required_missing, budget_status, rdd_coverage, division_mix` };
          }
        }

        return { topic: input.topic, data };
      } finally {
        await qr.release();
      }
    },
  };
}
