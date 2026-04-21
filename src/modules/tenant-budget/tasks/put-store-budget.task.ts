import { IsUUID } from 'class-validator';
import type { Repository } from 'typeorm';
import { Collection } from '../../../entities/collection.entity.js';
import { Store } from '../../../entities/store.entity.js';
import { StoreBudget } from '../../../entities/store-budget.entity.js';
import { BudgetAggregationService } from '../../../services/budget-aggregation.service.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody, verifyParams } from '../../../utils/schema.js';
import { PutStoreBudgetInput, type StoreBudgetOutput } from '../dto/tenant-budget.dto.js';

class PutStoreBudgetParams {
  @IsUUID()
  id!: string;
}

@Injectable()
export class PutStoreBudgetTask extends Task<StoreBudgetOutput> {
  protected validations = [
    verifyParams(PutStoreBudgetParams),
    verifyBody(PutStoreBudgetInput, true),
  ];

  constructor(
    @Inject('StoreBudgetRepository') private readonly budgets: Repository<StoreBudget>,
    @Inject('StoreRepository') private readonly stores: Repository<Store>,
    @Inject('CollectionRepository') private readonly collections: Repository<Collection>,
    @Inject(BudgetAggregationService) private readonly agg: BudgetAggregationService,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<StoreBudgetOutput> {
    const tenantId = input.headers.tenantId as string;
    const userId = input.headers.userId as string | undefined;
    const { id: storeId } = input.params as { id: string };
    const dto = input.body as PutStoreBudgetInput;

    const store = await this.stores.findOne({ where: { id: storeId, tenant_id: tenantId } });
    if (!store) throw HttpError.NotFound('not_found', 'Loja não encontrada');

    const collection = await this.collections.findOne({ where: { id: dto.collection_id } });
    if (!collection) throw HttpError.NotFound('not_found', 'Coleção não encontrada');

    const existing = await this.budgets.findOne({
      where: { store_id: storeId, collection_id: dto.collection_id, tenant_id: tenantId },
    });

    const saved = existing
      ? await this.budgets.save({
          ...existing,
          amount_brl: dto.amount_brl.toFixed(2),
          updated_by: userId ?? null,
        })
      : await this.budgets.save({
          tenant_id: tenantId,
          store_id: storeId,
          collection_id: dto.collection_id,
          amount_brl: dto.amount_brl.toFixed(2),
          updated_by: userId ?? null,
        });

    const usedByStore = await this.agg.usedByStore(tenantId, dto.collection_id);
    return {
      store_id: saved.store_id,
      collection_id: saved.collection_id,
      amount_brl: Number(saved.amount_brl),
      used_brl: usedByStore.get(saved.store_id) ?? 0,
      updated_at: saved.updated_at.toISOString(),
    };
  }
}
