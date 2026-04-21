import type { Repository } from 'typeorm';
import { BatchHiddenProduct } from '../../../entities/batch-hidden-product.entity.js';
import { OrderBatch } from '../../../entities/order-batch.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';

@Injectable()
export class HideBatchProductTask extends Task<null> {
  constructor(
    @Inject('OrderBatchRepository') private readonly batches: Repository<OrderBatch>,
    @Inject('BatchHiddenProductRepository')
    private readonly hidden: Repository<BatchHiddenProduct>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<null> {
    const tenantId = input.headers.tenantId as string;
    const { id, productId } = input.params as { id: string; productId: string };

    const batch = await this.batches.findOne({ where: { id, tenant_id: tenantId } });
    if (!batch) {
      throw HttpError.NotFound('batch_not_found', 'Pedido não encontrado');
    }

    await this.hidden
      .createQueryBuilder()
      .insert()
      .into(BatchHiddenProduct)
      .values({ batch_id: id, product_id: productId })
      .orIgnore()
      .execute();

    return null;
  }
}
