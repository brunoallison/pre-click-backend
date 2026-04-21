import type { Repository } from 'typeorm';
import { Store } from '../../../entities/store.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { UpdateStoreInput, type StoreOutput } from '../dto/store.dto.js';

@Injectable()
export class UpdateStoreTask extends Task<StoreOutput> {
  protected validations = [verifyBody(UpdateStoreInput, true)];

  constructor(@Inject('StoreRepository') private readonly stores: Repository<Store>) {
    super();
  }

  async execute(input: BaseInput): Promise<StoreOutput> {
    const tenantId = input.headers.tenantId as string;
    const { id } = input.params as { id: string };
    const dto = input.body as UpdateStoreInput;

    const store = await this.stores.findOne({ where: { id, tenant_id: tenantId } });
    if (!store) throw HttpError.NotFound('not_found', 'Loja não encontrada');

    if (dto.legal_name !== undefined) store.legal_name = dto.legal_name;
    if (dto.display_name !== undefined) store.display_name = dto.display_name;
    if (dto.store_concept !== undefined) store.store_concept = dto.store_concept;
    if (dto.customer_id_sap !== undefined) store.customer_id_sap = dto.customer_id_sap;
    if (dto.store_number !== undefined) store.store_number = dto.store_number;
    if (dto.country !== undefined) store.country = dto.country;
    if (dto.cluster !== undefined) store.cluster = dto.cluster;
    if (dto.city !== undefined) store.city = dto.city;
    if (dto.state !== undefined) store.state = dto.state;
    if (dto.status_comp !== undefined) store.status_comp = dto.status_comp;
    if (dto.is_dummy !== undefined) store.is_dummy = dto.is_dummy;
    if (dto.is_active !== undefined) store.is_active = dto.is_active;

    const saved = await this.stores.save(store);

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
