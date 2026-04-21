import type { Repository } from 'typeorm';
import { Collection } from '../../../entities/collection.entity.js';
import { TenantBudget } from '../../../entities/tenant-budget.entity.js';
import { BudgetAggregationService } from '../../../services/budget-aggregation.service.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { PutTenantBudgetInput, type TenantBudgetOutput } from '../dto/tenant-budget.dto.js';

@Injectable()
export class PutTenantBudgetTask extends Task<TenantBudgetOutput> {
  protected validations = [verifyBody(PutTenantBudgetInput, true)];

  constructor(
    @Inject('TenantBudgetRepository') private readonly budgets: Repository<TenantBudget>,
    @Inject('CollectionRepository') private readonly collections: Repository<Collection>,
    @Inject(BudgetAggregationService) private readonly agg: BudgetAggregationService,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<TenantBudgetOutput> {
    const tenantId = input.headers.tenantId as string;
    const userId = input.headers.userId as string | undefined;
    const dto = input.body as PutTenantBudgetInput;

    const collection = await this.collections.findOne({ where: { id: dto.collection_id } });
    if (!collection) throw HttpError.NotFound('not_found', 'Coleção não encontrada');

    const existing = await this.budgets.findOne({
      where: { tenant_id: tenantId, collection_id: dto.collection_id },
    });

    const saved = existing
      ? await this.budgets.save({
          ...existing,
          amount_brl: dto.amount_brl.toFixed(2),
          updated_by: userId ?? null,
        })
      : await this.budgets.save({
          tenant_id: tenantId,
          collection_id: dto.collection_id,
          amount_brl: dto.amount_brl.toFixed(2),
          updated_by: userId ?? null,
        });

    const used = await this.agg.tenantUsedBrl(tenantId, dto.collection_id);
    return {
      collection_id: saved.collection_id,
      amount_brl: Number(saved.amount_brl),
      used_brl: used,
      updated_at: saved.updated_at.toISOString(),
    };
  }
}
