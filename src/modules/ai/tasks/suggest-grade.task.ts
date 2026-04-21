import { IsNull, type Repository } from 'typeorm';
import { AiCall } from '../../../entities/ai-call.entity.js';
import { Grade } from '../../../entities/grade.entity.js';
import { Order } from '../../../entities/order.entity.js';
import { Product } from '../../../entities/product.entity.js';
import { AnthropicProvider } from '../../../providers/anthropic/anthropic.provider.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { logger } from '../../../utils/logger.js';
import { HttpError } from '../../../utils/error.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { SuggestGradeInput, type SuggestGradeOutput } from '../dto/ai.dto.js';

const SYSTEM_PROMPT = `Você sugere uma grade (distribuição por tamanho) e multiplicador N para um SKU Adidas dado um produto, loja e pedido. Retorne APENAS JSON no formato {"grade_id": "<uuid>", "multiplier": <int>, "rationale": "<texto em pt-br>", "confidence": <0..1>}. Se não houver grade adequada, escolha a primeira da lista. Nunca invente IDs.`;

@Injectable()
export class SuggestGradeTask extends Task<SuggestGradeOutput> {
  protected validations = [verifyBody(SuggestGradeInput, true)];

  constructor(
    @Inject(AnthropicProvider) private readonly anthropic: AnthropicProvider,
    @Inject('AiCallRepository') private readonly calls: Repository<AiCall>,
    @Inject('GradeRepository') private readonly grades: Repository<Grade>,
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('ProductRepository') private readonly products: Repository<Product>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<SuggestGradeOutput> {
    const tenantId = input.headers.tenantId as string;
    const userId = input.headers.userId as string;
    const dto = input.body as SuggestGradeInput;

    const order = await this.orders.findOne({
      where: { id: dto.order_id, tenant_id: tenantId },
    });
    if (!order) throw HttpError.NotFound('not_found', 'Pedido não encontrado');

    const product = await this.products.findOne({ where: { id: dto.product_id } });
    if (!product) throw HttpError.NotFound('not_found', 'Produto não encontrado');

    const candidates = await this.grades.find({
      where: [
        { collection_id: order.collection_id, tenant_id: tenantId },
        { collection_id: order.collection_id, tenant_id: IsNull() },
      ],
      order: { total_pieces: 'ASC' },
      take: 20,
    });
    if (candidates.length === 0) {
      throw HttpError.NotFound('not_found', 'Nenhuma grade disponível para esta coleção');
    }

    const userPrompt = [
      `Produto: ${product.article_sku} (${product.division})`,
      `Loja: ${dto.store_id}`,
      `Pedido: ${dto.order_id}`,
      `Grades candidatas:`,
      ...candidates.map((g) => `- id=${g.id} code=${g.code} total=${g.total_pieces}`),
    ].join('\n');

    let pick = candidates[0]!;
    let multiplier = 1;
    let rationale = `Grade ${pick.code} (${pick.total_pieces} peças) — menor grade disponível como ponto de partida.`;
    let confidence = 0.3;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let latencyMs: number | null = null;
    let errorMsg: string | null = null;

    try {
      const res = await this.anthropic.complete({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });
      inputTokens = res.input_tokens;
      outputTokens = res.output_tokens;
      latencyMs = res.latency_ms;
      const parsed = this.tryParse(res.text);
      if (parsed) {
        const hit = candidates.find((g) => g.id === parsed.grade_id);
        if (hit) {
          pick = hit;
          multiplier = Math.max(1, Math.floor(parsed.multiplier));
          rationale = parsed.rationale;
          confidence = Math.max(0, Math.min(1, parsed.confidence));
        }
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err: errorMsg, tenantId }, 'SuggestGradeTask: falha ao chamar Anthropic');
    }

    await this.calls.save({
      tenant_id: tenantId,
      user_id: userId ?? null,
      kind: 'suggest_grade',
      order_id: dto.order_id,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      cached: false,
      error: errorMsg,
    });

    return { grade_id: pick.id, multiplier, rationale, confidence };
  }

  private tryParse(
    text: string,
  ): { grade_id: string; multiplier: number; rationale: string; confidence: number } | null {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const obj = JSON.parse(match[0]);
      if (
        typeof obj.grade_id === 'string' &&
        typeof obj.multiplier === 'number' &&
        typeof obj.rationale === 'string' &&
        typeof obj.confidence === 'number'
      ) {
        return obj;
      }
      return null;
    } catch {
      return null;
    }
  }
}
