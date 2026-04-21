import { IsNull, type Repository } from 'typeorm';
import type { Grade } from '../../../entities/grade.entity.js';
import type { Order } from '../../../entities/order.entity.js';
import type { Product } from '../../../entities/product.entity.js';
import type { AnthropicProvider } from '../../../providers/anthropic/anthropic.provider.js';
import type { Skill, SkillContext } from '../skill.types.js';

interface SuggestGradeInput {
  product_id: string;
  store_id: string;
  order_id: string;
}

interface SuggestGradeOutput {
  grade_id: string;
  grade_code: string;
  multiplier: number;
  rationale: string;
  confidence: number;
}

const SYSTEM_PROMPT = `Você sugere uma grade (distribuição por tamanho) e multiplicador N para um SKU Adidas dado um produto, loja e pedido. Retorne APENAS JSON no formato {"grade_id": "<uuid>", "multiplier": <int>, "rationale": "<texto em pt-br>", "confidence": <0..1>}. Se não houver grade adequada, escolha a primeira da lista. Nunca invente IDs.`;

function tryParse(
  text: string,
): { grade_id: string; multiplier: number; rationale: string; confidence: number } | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    if (
      typeof obj.grade_id === 'string' &&
      typeof obj.multiplier === 'number' &&
      typeof obj.rationale === 'string' &&
      typeof obj.confidence === 'number'
    ) {
      return {
        grade_id: obj.grade_id,
        multiplier: obj.multiplier,
        rationale: obj.rationale,
        confidence: obj.confidence,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function buildSuggestGradeSkill(
  orders: Repository<Order>,
  products: Repository<Product>,
  grades: Repository<Grade>,
  anthropic: AnthropicProvider,
): Skill<SuggestGradeInput, SuggestGradeOutput | { error: string }> {
  return {
    name: 'suggest_grade',
    description:
      'Sugere uma grade e multiplicador para um produto em um pedido específico. Retorna sugestão apenas — o usuário aplica via UI.',
    sideEffect: 'read',
    inputSchema: {
      type: 'object',
      required: ['product_id', 'store_id', 'order_id'],
      properties: {
        product_id: { type: 'string', description: 'ID do produto' },
        store_id: { type: 'string', description: 'ID da loja' },
        order_id: { type: 'string', description: 'ID do pedido' },
      },
    },
    async handler(
      ctx: SkillContext,
      input: SuggestGradeInput,
    ): Promise<SuggestGradeOutput | { error: string }> {
      const order = await orders.findOne({
        where: { id: input.order_id, tenant_id: ctx.tenantId },
      });
      if (!order) return { error: 'Pedido não encontrado' };

      const product = await products.findOne({ where: { id: input.product_id } });
      if (!product) return { error: 'Produto não encontrado' };

      const candidates = await grades.find({
        where: [
          { collection_id: order.collection_id, tenant_id: ctx.tenantId },
          { collection_id: order.collection_id, tenant_id: IsNull() },
        ],
        order: { total_pieces: 'ASC' },
        take: 20,
      });

      if (!candidates.length) return { error: 'Nenhuma grade disponível para esta coleção' };

      const userPrompt = [
        `Produto: ${product.article_sku} (${product.division})`,
        `Loja: ${input.store_id}`,
        `Pedido: ${input.order_id}`,
        `Grades candidatas:`,
        ...candidates.map((g) => `- id=${g.id} code=${g.code} total=${g.total_pieces}`),
      ].join('\n');

      let pick = candidates[0]!;
      let multiplier = 1;
      let rationale = `Grade ${pick.code} (${pick.total_pieces} peças) — menor grade disponível como ponto de partida.`;
      let confidence = 0.3;

      try {
        const res = await anthropic.complete({
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        });
        const parsed = tryParse(res.text);
        if (parsed) {
          const hit = candidates.find((g) => g.id === parsed.grade_id);
          if (hit) {
            pick = hit;
            multiplier = Math.max(1, Math.floor(parsed.multiplier));
            rationale = parsed.rationale;
            confidence = Math.max(0, Math.min(1, parsed.confidence));
          }
        }
      } catch {
        // mantém defaults
      }

      return { grade_id: pick.id, grade_code: pick.code, multiplier, rationale, confidence };
    },
  };
}
