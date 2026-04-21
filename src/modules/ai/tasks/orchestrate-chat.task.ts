import { randomUUID } from 'node:crypto';
import type { DataSource, Repository } from 'typeorm';
import type { AiConversation } from '../../../entities/ai-conversation.entity.js';
import type { AiMessage } from '../../../entities/ai-message.entity.js';
import type { Grade } from '../../../entities/grade.entity.js';
import type { Order } from '../../../entities/order.entity.js';
import type { Product } from '../../../entities/product.entity.js';
import { AnthropicProvider } from '../../../providers/anthropic/anthropic.provider.js';
import { ConversationService } from '../../../services/ai/conversation.service.js';
import { buildSkillRegistry } from '../../../services/ai/skill-registry.js';
import { OrchestratorService } from '../../../services/ai/orchestrator.service.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { ChatInput, type ChatOutput } from '../dto/ai.dto.js';

@Injectable()
export class OrchestrateChatTask extends Task<ChatOutput> {
  protected validations = [verifyBody(ChatInput, true)];

  private readonly orchestrator: OrchestratorService;

  constructor(
    @Inject(AnthropicProvider) private readonly anthropic: AnthropicProvider,
    @Inject('AiConversationRepository') private readonly conversations: Repository<AiConversation>,
    @Inject('AiMessageRepository') private readonly messages: Repository<AiMessage>,
    @Inject('ProductRepository') private readonly products: Repository<Product>,
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('GradeRepository') private readonly grades: Repository<Grade>,
    @Inject('DataSource') private readonly dataSource: DataSource,
  ) {
    super();

    const conversationService = new ConversationService(this.conversations, this.messages);
    const skillRegistry = buildSkillRegistry({
      dataSource: this.dataSource,
      products: this.products,
      orders: this.orders,
      grades: this.grades,
      anthropic: this.anthropic,
    });
    this.orchestrator = new OrchestratorService(conversationService, skillRegistry);
  }

  async execute(input: BaseInput): Promise<ChatOutput> {
    const tenantId = input.headers.tenantId as string;
    const userId = input.headers.userId as string;
    const role = (input.headers.role as string) ?? 'user';
    const dto = input.body as ChatInput;

    const result = await this.orchestrator.run({
      tenantId,
      userId,
      role,
      conversationId: dto.conversation_id,
      message: dto.message,
      uiContext: dto.ui_context,
    });

    return {
      session_id: dto.session_id ?? randomUUID(),
      reply: result.reply,
      conversation_id: result.conversation_id,
      tool_calls: result.tool_calls,
    };
  }
}
