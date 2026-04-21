import type { Repository } from 'typeorm';
import { Collection } from '../../../entities/collection.entity.js';
import { Store } from '../../../entities/store.entity.js';
import { StoreBudget } from '../../../entities/store-budget.entity.js';
import { BudgetAggregationService } from '../../../services/budget-aggregation.service.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { tenantScoped } from '../../../utils/tenant-scoped.js';
import type { StoreOutput } from '../dto/store.dto.js';

@Injectable()
export class ListStoresTask extends Task<StoreOutput[]> {
  constructor(
    @Inject('StoreRepository') private readonly stores: Repository<Store>,
    @Inject('StoreBudgetRepository') private readonly budgets: Repository<StoreBudget>,
    @Inject('CollectionRepository') private readonly collections: Repository<Collection>,
    @Inject(BudgetAggregationService) private readonly agg: BudgetAggregationService,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<StoreOutput[]> {
    const tenantId = input.headers.tenantId as string;
    const query = input.query as { collection_id?: string };

    const rows = await tenantScoped(this.stores, tenantId).find({
      order: { display_name: 'ASC' },
    });

    const collectionId =
      query.collection_id ??
      (await this.collections.findOne({ where: { status: 'open' }, order: { created_at: 'DESC' } }))
        ?.id;

    let budgetByStore = new Map<string, number>();
    let usedByStore = new Map<string, number>();
    let piecesByStore = new Map<string, number>();
    if (collectionId) {
      const budgetRows = await this.budgets.find({
        where: { tenant_id: tenantId, collection_id: collectionId },
      });
      budgetByStore = new Map(budgetRows.map((b) => [b.store_id, Number(b.amount_brl)]));
      usedByStore = await this.agg.usedByStore(tenantId, collectionId);
      piecesByStore = await this.agg.piecesByStore(tenantId, collectionId);
    }

    return rows.map((s) => ({
      id: s.id,
      customer_id_sap: s.customer_id_sap,
      legal_name: s.legal_name,
      display_name: s.display_name,
      store_number: s.store_number,
      country: s.country,
      store_concept: s.store_concept,
      cluster: s.cluster,
      city: s.city,
      state: s.state,
      status_comp: s.status_comp,
      is_dummy: s.is_dummy,
      is_active: s.is_active,
      budget: collectionId
        ? {
            amount_brl: budgetByStore.get(s.id) ?? null,
            used_brl: usedByStore.get(s.id) ?? 0,
          }
        : null,
      total_pieces: piecesByStore.get(s.id) ?? 0,
    }));
  }
}
