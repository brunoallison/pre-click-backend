import type { Repository } from 'typeorm';
import { AiContext } from '../../../entities/ai-context.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import type { AiContextOutput } from '../dto/ai.dto.js';

@Injectable()
export class ListContextsTask extends Task<AiContextOutput[]> {
  constructor(@Inject('AiContextRepository') private readonly contexts: Repository<AiContext>) {
    super();
  }

  async execute(input: BaseInput): Promise<AiContextOutput[]> {
    const tenantId = input.headers.tenantId as string;
    const rows = await this.contexts.find({
      where: { tenant_id: tenantId },
      order: { uploaded_at: 'DESC' },
    });
    return rows.map((c) => ({
      id: c.id,
      source: c.source,
      filename: (c.payload as { filename?: string } | null)?.filename ?? '—',
      collection_ref: c.collection_ref,
      row_count: c.row_count,
      uploaded_at: c.uploaded_at.toISOString(),
    }));
  }
}
