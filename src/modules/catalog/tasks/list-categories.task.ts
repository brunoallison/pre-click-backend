import type { Repository } from 'typeorm';
import { Product } from '../../../entities/product.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';

export interface CategoryOutput {
  name: string;
  count: number;
}

export interface ListCategoriesOutput {
  items: CategoryOutput[];
}

@Injectable()
export class ListCategoriesTask extends Task<ListCategoriesOutput> {
  constructor(@Inject('ProductRepository') private readonly products: Repository<Product>) {
    super();
  }

  async execute(input: BaseInput): Promise<ListCategoriesOutput> {
    const { collection_id } = input.query as { collection_id?: string };

    const qb = this.products
      .createQueryBuilder('p')
      .select('p.key_category', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('p.key_category IS NOT NULL')
      .andWhere("p.key_category <> ''")
      .andWhere('p.removed_at IS NULL')
      .groupBy('p.key_category')
      .orderBy('p.key_category', 'ASC');

    if (collection_id) qb.andWhere('p.collection_id = :cid', { cid: collection_id });

    const rows = await qb.getRawMany<{ name: string; count: string | number }>();
    return { items: rows.map((r) => ({ name: r.name, count: Number(r.count) })) };
  }
}
