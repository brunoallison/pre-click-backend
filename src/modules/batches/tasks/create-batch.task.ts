import { In, type DataSource, type Repository } from 'typeorm';
import { Collection } from '../../../entities/collection.entity.js';
import { Order } from '../../../entities/order.entity.js';
import { OrderBatch } from '../../../entities/order-batch.entity.js';
import { Store } from '../../../entities/store.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { CreateOrderBatchInput, type OrderBatchDetailOutput } from '../dto/batches.dto.js';

@Injectable()
export class CreateBatchTask extends Task<OrderBatchDetailOutput> {
  protected validations = [verifyBody(CreateOrderBatchInput, true)];

  constructor(
    @Inject('DataSource') private readonly ds: DataSource,
    @Inject('OrderBatchRepository') private readonly batches: Repository<OrderBatch>,
    @Inject('CollectionRepository') private readonly collections: Repository<Collection>,
    @Inject('StoreRepository') private readonly stores: Repository<Store>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<OrderBatchDetailOutput> {
    const tenantId = input.headers.tenantId as string;
    const userId = input.headers.userId as string;
    const dto = input.body as CreateOrderBatchInput;

    const name = dto.name.trim();
    if (!name) {
      throw HttpError.BadRequest('name_required', 'Nome do pedido é obrigatório');
    }

    const collection = await this.collections.findOne({ where: { id: dto.collection_id } });
    if (!collection) {
      throw HttpError.NotFound('collection_not_found', 'Coleção não encontrada');
    }

    const duplicated = await this.batches.findOne({
      where: { tenant_id: tenantId, collection_id: dto.collection_id, name },
    });
    if (duplicated) {
      throw HttpError.Conflict(
        'batch_name_conflict',
        `Já existe um pedido com este nome nesta coleção`,
      );
    }

    const storeIds = Array.from(new Set(dto.store_ids));
    const storesFound = await this.stores.find({
      where: { id: In(storeIds), tenant_id: tenantId, is_active: true, is_dummy: false },
    });
    if (storesFound.length !== storeIds.length) {
      throw HttpError.BadRequest(
        'invalid_stores',
        'Uma ou mais lojas não pertencem ao tenant ou estão inativas',
      );
    }

    return this.ds.transaction(async (manager) => {
      const batchRepo = manager.getRepository(OrderBatch);
      const orderRepo = manager.getRepository(Order);

      const batch = batchRepo.create({
        tenant_id: tenantId,
        collection_id: dto.collection_id,
        name,
        status: 'draft',
        export_count: 0,
        last_exported_at: null,
        created_by: userId,
      });
      const savedBatch = await batchRepo.save(batch);

      const orders = storeIds.map((storeId) =>
        orderRepo.create({
          tenant_id: tenantId,
          collection_id: dto.collection_id,
          batch_id: savedBatch.id,
          store_id: storeId,
          status: 'draft',
          created_by: userId,
        }),
      );
      await orderRepo.save(orders);

      return {
        id: savedBatch.id,
        collection_id: savedBatch.collection_id,
        name: savedBatch.name,
        status: savedBatch.status,
        export_count: savedBatch.export_count,
        last_exported_at: null,
        store_count: storeIds.length,
        item_count: 0,
        total_pieces: 0,
        store_ids: storeIds,
        created_at: savedBatch.created_at.toISOString(),
        updated_at: savedBatch.updated_at.toISOString(),
      };
    });
  }
}
