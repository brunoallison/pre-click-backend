import type { Repository } from 'typeorm';
import type { AiConversation } from '../../../entities/ai-conversation.entity.js';
import type { AiMessage } from '../../../entities/ai-message.entity.js';
import { ConversationService } from '../../../services/ai/conversation.service.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import type { AiConversationOutput } from '../dto/ai.dto.js';

@Injectable()
export class ListConversationsTask extends Task<AiConversationOutput[]> {
  constructor(
    @Inject('AiConversationRepository') private readonly conversations: Repository<AiConversation>,
    @Inject('AiMessageRepository') private readonly messages: Repository<AiMessage>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<AiConversationOutput[]> {
    const tenantId = input.headers.tenantId as string;
    const userId = input.headers.userId as string;

    const svc = new ConversationService(this.conversations, this.messages);
    const convs = await svc.listConversations(tenantId, userId);

    return convs.map((c) => ({
      id: c.id,
      visibility: c.visibility,
      title: c.title,
      created_by: c.created_by,
      created_at: c.created_at.toISOString(),
      updated_at: c.updated_at.toISOString(),
    }));
  }
}
