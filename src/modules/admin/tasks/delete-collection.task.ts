import type { Repository } from 'typeorm';
import { Collection } from '../../../entities/collection.entity.js';
import { Order } from '../../../entities/order.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { HttpError } from '../../../utils/error.js';
import { verifyParams } from '../../../utils/schema.js';
import { CollectionIdParams } from '../dto/collection.dto.js';

@Injectable()
export class DeleteCollectionTask extends Task<{ ok: true }> {
  protected validations = [verifyParams(CollectionIdParams)];

  constructor(
    @Inject('CollectionRepository') private readonly col: Repository<Collection>,
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<{ ok: true }> {
    const { id } = input.params as CollectionIdParams;

    const collection = await this.col.findOne({ where: { id } });
    if (!collection) throw HttpError.NotFound('not_found', 'Coleção não encontrada');

    const orderCount = await this.orders.count({ where: { collection_id: id } });
    if (orderCount > 0) {
      throw HttpError.Conflict(
        'collection_has_orders',
        `Coleção ${collection.code} tem ${orderCount} pedido(s) e não pode ser excluída`,
      );
    }

    await this.col.delete({ id });
    return { ok: true };
  }
}
