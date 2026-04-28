import type { Repository } from 'typeorm';
import { Collection } from '../../../entities/collection.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task } from '../../../utils/task.js';
import {
  resolveCollectionStatus,
  type DerivedCollectionStatus,
} from '../../../utils/collection-status.js';

interface CollectionOut {
  id: string;
  code: string;
  country: string;
  name: string;
  status: DerivedCollectionStatus;
  order_window: { start: string | null; end: string | null };
  delivery_window: { start: string | null; end: string | null };
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

@Injectable()
export class ListCollectionsTask extends Task<CollectionOut[]> {
  constructor(@Inject('CollectionRepository') private readonly col: Repository<Collection>) {
    super();
  }
  async execute(): Promise<CollectionOut[]> {
    const rows = await this.col.find({});
    const now = new Date();
    return rows.map((c) => ({
      id: c.id,
      code: c.code,
      country: c.country,
      name: c.name,
      status: resolveCollectionStatus(c, now),
      order_window: { start: iso(c.order_start_at), end: iso(c.order_end_at) },
      delivery_window: { start: iso(c.delivery_start_at), end: iso(c.delivery_end_at) },
    }));
  }
}
