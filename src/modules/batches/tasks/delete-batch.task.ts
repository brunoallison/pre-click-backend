import type { Repository } from 'typeorm';
import { OrderBatch } from '../../../entities/order-batch.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';

@Injectable()
export class DeleteBatchTask extends Task<null> {
  constructor(@Inject('OrderBatchRepository') private readonly batches: Repository<OrderBatch>) {
    super();
  }

  async execute(input: BaseInput): Promise<null> {
    const tenantId = input.headers.tenantId as string;
    const { id } = input.params as { id: string };

    const batch = await this.batches.findOne({ where: { id, tenant_id: tenantId } });
    if (!batch) {
      throw HttpError.NotFound('batch_not_found', 'Pedido não encontrado');
    }

    // CASCADE em order + order_item via FK.
    await this.batches.remove(batch);
    return null;
  }
}
