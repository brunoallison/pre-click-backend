import type { Repository } from 'typeorm';
import { Store } from '../../../entities/store.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { tenantScoped } from '../../../utils/tenant-scoped.js';
import type { StoreOutput } from '../dto/store.dto.js';

@Injectable()
export class ListStoresTask extends Task<StoreOutput[]> {
  constructor(@Inject('StoreRepository') private readonly stores: Repository<Store>) {
    super();
  }

  async execute(input: BaseInput): Promise<StoreOutput[]> {
    const tenantId = input.headers.tenantId as string;
    const rows = await tenantScoped(this.stores, tenantId).find({});
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
    }));
  }
}
