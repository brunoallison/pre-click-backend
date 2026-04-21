import type { Repository } from 'typeorm';
import type { Product } from '../../../entities/product.entity.js';
import type { Skill, SkillContext } from '../skill.types.js';

interface FindSkuInput {
  query: string;
  collection_id?: string;
}

interface SkuMatch {
  id: string;
  article_sku: string;
  local_description: string;
  category: string | null;
  rrp_brl: number;
  division: string;
}

interface FindSkuOutput {
  matches: SkuMatch[];
  total: number;
}

export function buildFindSkuSkill(products: Repository<Product>): Skill<FindSkuInput, FindSkuOutput> {
  return {
    name: 'find_sku',
    description:
      'Busca produtos por SKU, descrição ou categoria. Retorna até 10 resultados mais relevantes.',
    sideEffect: 'read',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Texto de busca (SKU, nome, categoria)' },
        collection_id: { type: 'string', description: 'Filtra por coleção (opcional)' },
      },
    },
    async handler(_ctx: SkillContext, input: FindSkuInput): Promise<FindSkuOutput> {
      const qb = products
        .createQueryBuilder('p')
        .where('p.removed_at IS NULL')
        .andWhere(
          '(p.article_sku ILIKE :q OR p.local_description ILIKE :q OR p.category ILIKE :q)',
          { q: `%${input.query}%` },
        );

      if (input.collection_id) {
        qb.andWhere('p.collection_id = :cid', { cid: input.collection_id });
      }

      const rows = await qb.take(10).getMany();
      const total = await qb.getCount();

      return {
        matches: rows.map((p) => ({
          id: p.id,
          article_sku: p.article_sku,
          local_description: p.local_description,
          category: p.category,
          rrp_brl: parseFloat(p.rrp),
          division: p.division,
        })),
        total,
      };
    },
  };
}
