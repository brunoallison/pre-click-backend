import type { Repository } from 'typeorm';
import { IsUUID } from 'class-validator';
import { AiContext } from '../../../entities/ai-context.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyParams } from '../../../utils/schema.js';

class DeleteContextParams {
  @IsUUID()
  id!: string;
}

@Injectable()
export class DeleteContextTask extends Task<void> {
  protected validations = [verifyParams(DeleteContextParams)];

  constructor(@Inject('AiContextRepository') private readonly contexts: Repository<AiContext>) {
    super();
  }

  async execute(input: BaseInput): Promise<void> {
    const tenantId = input.headers.tenantId as string;
    const { id } = input.params as { id: string };
    const found = await this.contexts.findOne({ where: { id, tenant_id: tenantId } });
    if (!found) throw HttpError.NotFound('not_found', 'Contexto não encontrado');
    await this.contexts.delete({ id, tenant_id: tenantId });
  }
}
