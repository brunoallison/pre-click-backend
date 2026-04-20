import type { Repository } from 'typeorm';
import { Collection } from '../../../entities/collection.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task } from '../../../utils/task.js';

interface CollectionOut {
  id: string;
  code: string;
  country: string;
  name: string;
  status: string;
}

@Injectable()
export class ListCollectionsTask extends Task<CollectionOut[]> {
  constructor(@Inject('CollectionRepository') private readonly col: Repository<Collection>) {
    super();
  }
  async execute(): Promise<CollectionOut[]> {
    const rows = await this.col.find({});
    return rows.map((c) => ({
      id: c.id,
      code: c.code,
      country: c.country,
      name: c.name,
      status: c.status,
    }));
  }
}
