import type { Repository } from 'typeorm';
import { TenantBudget } from '../../../entities/tenant-budget.entity.js';
import { BudgetAggregationService } from '../../../services/budget-aggregation.service.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyQuery } from '../../../utils/schema.js';
import { GetTenantBudgetQuery, type TenantBudgetOutput } from '../dto/tenant-budget.dto.js';

@Injectable()
export class GetTenantBudgetTask extends Task<TenantBudgetOutput> {
  protected validations = [verifyQuery(GetTenantBudgetQuery)];

  constructor(
    @Inject('TenantBudgetRepository') private readonly budgets: Repository<TenantBudget>,
    @Inject(BudgetAggregationService) private readonly agg: BudgetAggregationService,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<TenantBudgetOutput> {
    const tenantId = input.headers.tenantId as string;
    const { collection_id } = input.query as GetTenantBudgetQuery;

    const budget = await this.budgets.findOne({
      where: { tenant_id: tenantId, collection_id },
    });
    const used = await this.agg.tenantUsedBrl(tenantId, collection_id);

    return {
      collection_id,
      amount_brl: budget ? Number(budget.amount_brl) : 0,
      used_brl: used,
      updated_at: budget?.updated_at.toISOString() ?? null,
    };
  }
}
