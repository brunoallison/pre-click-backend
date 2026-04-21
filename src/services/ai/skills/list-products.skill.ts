import type { Repository } from 'typeorm';
import type { Product } from '../../../entities/product.entity.js';
import type { Skill, SkillContext } from '../skill.types.js';

interface ListProductsInput {
  collection_id: string;
  key_category?: string;
  prod_group?: string;
  search?: string;
  limit?: number;
}

interface ProductSummary {
  id: string;
  article_sku: string;
  local_description: string;
  category: string | null;
  division: string;
  rrp_brl: number;
  vol_minimo: number;
}

interface ListProductsOutput {
  products: ProductSummary[];
  total: number;
}

export function buildListProductsSkill(
  products: Repository<Product>,
): Skill<ListProductsInput, ListProductsOutput> {
  return {
    name: 'list_products',
    description:
      'Lista produtos do catálogo de uma coleção. Suporta filtros por categoria, grupo e busca por texto.',
    sideEffect: 'read',
    inputSchema: {
      type: 'object',
      required: ['collection_id'],
      properties: {
        collection_id: { type: 'string', description: 'ID da coleção' },
        key_category: { type: 'string', description: 'Filtro por KEY CATEGORY (ex: ORIGINALS)' },
        prod_group: { type: 'string', description: 'Filtro por PROD GROUP' },
        search: { type: 'string', description: 'Busca em SKU + descrição' },
        limit: { type: 'number', description: 'Máx de resultados (padrão 20)' },
      },
    },
    async handler(_ctx: SkillContext, input: ListProductsInput): Promise<ListProductsOutput> {
      const qb = products
        .createQueryBuilder('p')
        .where('p.collection_id = :cid', { cid: input.collection_id })
        .andWhere('p.removed_at IS NULL');

      if (input.key_category) {
        qb.andWhere('p.key_category = :kc', { kc: input.key_category });
      }
      if (input.prod_group) {
        qb.andWhere('p.prod_group = :pg', { pg: input.prod_group });
      }
      if (input.search) {
        qb.andWhere(
          '(p.article_sku ILIKE :q OR p.local_description ILIKE :q OR p.category ILIKE :q)',
          { q: `%${input.search}%` },
        );
      }

      const limit = Math.min(input.limit ?? 20, 100);
      const rows = await qb.take(limit).getMany();
      const total = await qb.getCount();

      return {
        products: rows.map((p) => ({
          id: p.id,
          article_sku: p.article_sku,
          local_description: p.local_description,
          category: p.category,
          division: p.division,
          rrp_brl: parseFloat(p.rrp),
          vol_minimo: p.vol_minimo,
        })),
        total,
      };
    },
  };
}
