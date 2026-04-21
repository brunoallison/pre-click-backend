import type { DataSource, Repository } from 'typeorm';
import type { Grade } from '../../entities/grade.entity.js';
import type { Order } from '../../entities/order.entity.js';
import type { Product } from '../../entities/product.entity.js';
import type { AnthropicProvider } from '../../providers/anthropic/anthropic.provider.js';
import { buildCompareStoresSkill } from './skills/compare-stores.skill.js';
import { buildExplainInsightSkill } from './skills/explain-insight.skill.js';
import { buildFindSkuSkill } from './skills/find-sku.skill.js';
import { buildGetDashboardInsightsSkill } from './skills/get-dashboard-insights.skill.js';
import { buildGetOrderInsightsSkill } from './skills/get-order-insights.skill.js';
import { buildGetStoreStatusSkill } from './skills/get-store-status.skill.js';
import { buildListProductsSkill } from './skills/list-products.skill.js';
import { buildSuggestGradeSkill } from './skills/suggest-grade.skill.js';
import type { Skill, SkillRegistry } from './skill.types.js';

interface SkillRegistryDeps {
  dataSource: DataSource;
  products: Repository<Product>;
  orders: Repository<Order>;
  grades: Repository<Grade>;
  anthropic: AnthropicProvider;
}

export function buildSkillRegistry(deps: SkillRegistryDeps): SkillRegistry {
  const skills: Skill[] = [
    buildListProductsSkill(deps.products),
    buildGetOrderInsightsSkill(deps.dataSource),
    buildGetDashboardInsightsSkill(deps.dataSource),
    buildGetStoreStatusSkill(deps.dataSource),
    buildCompareStoresSkill(deps.dataSource),
    buildFindSkuSkill(deps.products),
    buildExplainInsightSkill(deps.dataSource),
    buildSuggestGradeSkill(deps.orders, deps.products, deps.grades, deps.anthropic),
  ];

  return {
    skills,
    get(name: string): Skill | undefined {
      return skills.find((s) => s.name === name);
    },
    toTools(): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
      return skills.map((s) => ({
        name: s.name,
        description: s.description,
        input_schema: s.inputSchema,
      }));
    },
  };
}
