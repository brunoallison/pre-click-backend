import { Not, type Repository } from 'typeorm';
import { OrderBatch } from '../../../entities/order-batch.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { RenameOrderBatchInput } from '../dto/batches.dto.js';

@Injectable()
export class RenameBatchTask extends Task<{ id: string; name: string; updated_at: string }> {
  protected validations = [verifyBody(RenameOrderBatchInput, true)];

  constructor(@Inject('OrderBatchRepository') private readonly batches: Repository<OrderBatch>) {
    super();
  }

  async execute(input: BaseInput): Promise<{ id: string; name: string; updated_at: string }> {
    const tenantId = input.headers.tenantId as string;
    const { id } = input.params as { id: string };
    const dto = input.body as RenameOrderBatchInput;
    const name = dto.name.trim();

    const batch = await this.batches.findOne({ where: { id, tenant_id: tenantId } });
    if (!batch) {
      throw HttpError.NotFound('batch_not_found', 'Pedido não encontrado');
    }

    if (batch.name !== name) {
      const duplicated = await this.batches.findOne({
        where: {
          tenant_id: tenantId,
          collection_id: batch.collection_id,
          name,
          id: Not(id),
        },
      });
      if (duplicated) {
        throw HttpError.Conflict(
          'batch_name_conflict',
          'Já existe um pedido com este nome nesta coleção',
        );
      }
      batch.name = name;
      await this.batches.save(batch);
    }

    return { id: batch.id, name: batch.name, updated_at: batch.updated_at.toISOString() };
  }
}
