import type { Repository } from 'typeorm';
import { Product } from '../../../entities/product.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';

interface ListOut {
  items: Array<Pick<Product, 'id' | 'article_sku' | 'local_description' | 'division' | 'rrp'>>;
  total: number;
}

@Injectable()
export class ListProductsTask extends Task<ListOut> {
  constructor(@Inject('ProductRepository') private readonly products: Repository<Product>) {
    super();
  }
  async execute(input: BaseInput): Promise<ListOut> {
    const query = input.query as { collection_id?: string };
    const where = query.collection_id ? { collection_id: query.collection_id } : {};
    const [items, total] = await this.products.findAndCount({ where, take: 500 });
    return {
      items: items.map((p) => ({
        id: p.id,
        article_sku: p.article_sku,
        local_description: p.local_description,
        division: p.division,
        rrp: p.rrp,
      })),
      total,
    };
  }
}
