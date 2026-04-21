import type { Repository } from 'typeorm';
import type { AiConversation } from '../../../entities/ai-conversation.entity.js';
import type { AiMessage } from '../../../entities/ai-message.entity.js';
import { ConversationService } from '../../../services/ai/conversation.service.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import type { AiConversationDetailOutput } from '../dto/ai.dto.js';

@Injectable()
export class GetConversationTask extends Task<AiConversationDetailOutput> {
  constructor(
    @Inject('AiConversationRepository') private readonly conversations: Repository<AiConversation>,
    @Inject('AiMessageRepository') private readonly messages: Repository<AiMessage>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<AiConversationDetailOutput> {
    const tenantId = input.headers.tenantId as string;
    const { id } = input.params as { id: string };

    const svc = new ConversationService(this.conversations, this.messages);
    const conv = await svc.getConversation(id, tenantId);
    if (!conv) throw HttpError.NotFound('not_found', 'Conversa não encontrada');

    const msgs = await svc.getMessages(id, 100);

    return {
      id: conv.id,
      visibility: conv.visibility,
      title: conv.title,
      created_by: conv.created_by,
      created_at: conv.created_at.toISOString(),
      updated_at: conv.updated_at.toISOString(),
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        user_id: m.user_id,
        tokens_input: m.tokens_input,
        tokens_output: m.tokens_output,
        model: m.model,
        created_at: m.created_at.toISOString(),
      })),
    };
  }
}
