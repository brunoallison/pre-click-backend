import type { Repository } from 'typeorm';
import { Collection } from '../../../entities/collection.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { HttpError } from '../../../utils/error.js';
import { verifyBody } from '../../../utils/schema.js';
import { CreateCollectionInput } from '../dto/collection.dto.js';
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
export class CreateCollectionTask extends Task<Out> {
  protected validations = [verifyBody(CreateCollectionInput)];

  constructor(@Inject('CollectionRepository') private readonly col: Repository<Collection>) {
    super();
  }

  async execute(input: BaseInput): Promise<Out> {
    const body = input.body as CreateCollectionInput;

    const orderStart = new Date(body.order_start_at);
    const orderEnd = new Date(body.order_end_at);
    const deliveryStart = new Date(body.delivery_start_at);
    const deliveryEnd = new Date(body.delivery_end_at);

    if (orderEnd.getTime() < orderStart.getTime()) {
      throw HttpError.BadRequest(
        'invalid_window',
        'order_end_at deve ser >= order_start_at',
      );
    }
    if (deliveryEnd.getTime() < deliveryStart.getTime()) {
      throw HttpError.BadRequest(
        'invalid_window',
        'delivery_end_at deve ser >= delivery_start_at',
      );
    }

    const existing = await this.col.findOne({
      where: { code: body.code, country: body.country },
    });
    if (existing) {
      throw HttpError.Conflict(
        'duplicate_collection',
        `Já existe uma coleção ${body.code} para o país ${body.country}`,
      );
    }

    const saved = await this.col.save({
      code: body.code,
      country: body.country,
      name: body.name,
      status: 'draft',
      order_start_at: orderStart,
      order_end_at: orderEnd,
      delivery_start_at: deliveryStart,
      delivery_end_at: deliveryEnd,
    });

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
