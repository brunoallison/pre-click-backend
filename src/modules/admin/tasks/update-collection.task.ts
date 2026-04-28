import type { Repository } from 'typeorm';
import { Collection } from '../../../entities/collection.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { HttpError } from '../../../utils/error.js';
import { verifyBody, verifyParams } from '../../../utils/schema.js';
import { CollectionIdParams, UpdateCollectionInput } from '../dto/collection.dto.js';
import {
  resolveCollectionStatus,
  type DerivedCollectionStatus,
} from '../../../utils/collection-status.js';

interface Out {
  id: string;
  code: string;
  country: string;
  name: string;
  status: DerivedCollectionStatus;
  order_window: { start: string | null; end: string | null };
  delivery_window: { start: string | null; end: string | null };
}

@Injectable()
export class UpdateCollectionTask extends Task<Out> {
  protected validations = [verifyParams(CollectionIdParams), verifyBody(UpdateCollectionInput)];

  constructor(@Inject('CollectionRepository') private readonly col: Repository<Collection>) {
    super();
  }

  async execute(input: BaseInput): Promise<Out> {
    const { id } = input.params as CollectionIdParams;
    const body = input.body as UpdateCollectionInput;

    const collection = await this.col.findOne({ where: { id } });
    if (!collection) throw HttpError.NotFound('not_found', 'Coleção não encontrada');

    if (body.name !== undefined) collection.name = body.name;
    if (body.order_start_at !== undefined) collection.order_start_at = new Date(body.order_start_at);
    if (body.order_end_at !== undefined) collection.order_end_at = new Date(body.order_end_at);
    if (body.delivery_start_at !== undefined)
      collection.delivery_start_at = new Date(body.delivery_start_at);
    if (body.delivery_end_at !== undefined)
      collection.delivery_end_at = new Date(body.delivery_end_at);

    if (
      collection.order_start_at &&
      collection.order_end_at &&
      collection.order_end_at.getTime() < collection.order_start_at.getTime()
    ) {
      throw HttpError.BadRequest('invalid_window', 'order_end_at deve ser >= order_start_at');
    }
    if (
      collection.delivery_start_at &&
      collection.delivery_end_at &&
      collection.delivery_end_at.getTime() < collection.delivery_start_at.getTime()
    ) {
      throw HttpError.BadRequest(
        'invalid_window',
        'delivery_end_at deve ser >= delivery_start_at',
      );
    }

    const saved = await this.col.save(collection);

    return {
      id: saved.id,
      code: saved.code,
      country: saved.country,
      name: saved.name,
      status: resolveCollectionStatus(saved),
      order_window: {
        start: saved.order_start_at?.toISOString() ?? null,
        end: saved.order_end_at?.toISOString() ?? null,
      },
      delivery_window: {
        start: saved.delivery_start_at?.toISOString() ?? null,
        end: saved.delivery_end_at?.toISOString() ?? null,
      },
    };
  }
}
