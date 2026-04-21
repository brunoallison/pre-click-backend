import type { Repository } from 'typeorm';
import { AiContext } from '../../../entities/ai-context.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';

interface AiContextAdminOut {
  id: string;
  tenant_id: string;
  source: 'sales_history' | 'fw26_portfolio';
  collection_ref: string | null;
  row_count: number;
  uploaded_by: string | null;
  uploaded_at: string;
}

@Injectable()
export class ListAiContextsAdminTask extends Task<AiContextAdminOut[]> {
  constructor(@Inject('AiContextRepository') private readonly contexts: Repository<AiContext>) {
    super();
  }

  async execute(input: BaseInput): Promise<AiContextAdminOut[]> {
    const { tenant_id } = input.query as { tenant_id?: string };
    const where = tenant_id ? { tenant_id } : {};
    const rows = await this.contexts.find({ where, order: { uploaded_at: 'DESC' } });
    return rows.map((c) => ({
      id: c.id,
      tenant_id: c.tenant_id,
      source: c.source,
      collection_ref: c.collection_ref,
      row_count: c.row_count,
      uploaded_by: c.uploaded_by,
      uploaded_at: c.uploaded_at.toISOString(),
    }));
  }
}
