import type { Repository } from 'typeorm';
import { BatchHiddenProduct } from '../../../entities/batch-hidden-product.entity.js';
import { OrderBatch } from '../../../entities/order-batch.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';

interface HiddenProductsOutput {
  product_ids: string[];
}

@Injectable()
export class GetBatchHiddenProductsTask extends Task<HiddenProductsOutput> {
  constructor(
    @Inject('OrderBatchRepository') private readonly batches: Repository<OrderBatch>,
    @Inject('BatchHiddenProductRepository')
    private readonly hidden: Repository<BatchHiddenProduct>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<HiddenProductsOutput> {
    const tenantId = input.headers.tenantId as string;
    const { id } = input.params as { id: string };

    const batch = await this.batches.findOne({ where: { id, tenant_id: tenantId } });
    if (!batch) {
      throw HttpError.NotFound('batch_not_found', 'Pedido não encontrado');
    }

    const rows = await this.hidden.find({
      where: { batch_id: id },
      select: ['product_id'],
    });

    return { product_ids: rows.map((r) => r.product_id) };
  }
}
