import type { Repository } from 'typeorm';
import { Store } from '../../../entities/store.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { CreateStoreInput, type StoreOutput } from '../dto/store.dto.js';

@Injectable()
export class CreateStoreTask extends Task<StoreOutput> {
  protected validations = [verifyBody(CreateStoreInput, true)];

  constructor(@Inject('StoreRepository') private readonly stores: Repository<Store>) {
    super();
  }

  async execute(input: BaseInput): Promise<StoreOutput> {
    const tenantId = input.headers.tenantId as string;
    const dto = input.body as CreateStoreInput;
    const saved = await this.stores.save({
      tenant_id: tenantId,
      legal_name: dto.legal_name,
      display_name: dto.display_name,
      store_concept: dto.store_concept,
      customer_id_sap: dto.customer_id_sap ?? null,
      store_number: dto.store_number ?? null,
      country: dto.country ?? 'BR',
      cluster: dto.cluster ?? null,
      city: dto.city ?? null,
      state: dto.state ?? null,
      status_comp: dto.status_comp ?? 'COMP',
      is_dummy: dto.is_dummy ?? false,
      is_active: true,
    });
    return {
      id: saved.id,
      customer_id_sap: saved.customer_id_sap,
      legal_name: saved.legal_name,
      display_name: saved.display_name,
      store_number: saved.store_number,
      country: saved.country,
      store_concept: saved.store_concept,
      cluster: saved.cluster,
      city: saved.city,
      state: saved.state,
      status_comp: saved.status_comp,
      is_dummy: saved.is_dummy,
      is_active: saved.is_active,
      budget: null,
      total_pieces: 0,
    };
  }
}
