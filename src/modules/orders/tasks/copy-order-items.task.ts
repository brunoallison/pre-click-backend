import type { Repository } from 'typeorm';
import { Order } from '../../../entities/order.entity.js';
import { OrderItem } from '../../../entities/order-item.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { CopyOrderInput, type CopyOrderOutput } from '../dto/orders.dto.js';

@Injectable()
export class CopyOrderItemsTask extends Task<CopyOrderOutput> {
  protected validations = [verifyBody(CopyOrderInput, true)];

  constructor(
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('OrderItemRepository') private readonly items: Repository<OrderItem>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<CopyOrderOutput> {
    const tenantId = input.headers.tenantId as string;
    const { id } = input.params as { id: string };
    const dto = input.body as CopyOrderInput;

    // Valida destino
    const destOrder = await this.orders.findOne({ where: { id, tenant_id: tenantId } });
    if (!destOrder) throw HttpError.NotFound('not_found', 'Pedido de destino não encontrado');
    if (destOrder.status === 'closed')
      throw HttpError.Conflict('order_closed', 'Pedido de destino fechado');

    // Valida origem (deve ser do mesmo tenant)
    const srcOrder = await this.orders.findOne({
      where: { id: dto.source_order_id, tenant_id: tenantId },
    });
    if (!srcOrder) throw HttpError.NotFound('not_found', 'Pedido de origem não encontrado');

    const srcItems = await this.items.find({
      where: { order_id: dto.source_order_id, tenant_id: tenantId },
    });
    const destItems = await this.items.find({
      where: { order_id: id, tenant_id: tenantId },
    });

    // Indexa destino por chave única
    const destMap = new Map<string, OrderItem>();
    for (const item of destItems) {
      const key = `${item.product_id}:${item.grade_id}:${item.rdd_override_serial ?? 'null'}`;
      destMap.set(key, item);
    }

    let copied = 0;
    let skippedForbidden = 0;
    let skippedConflict = 0;
    const conflicts: CopyOrderOutput['conflicts'] = [];

    for (const src of srcItems) {
      if (src.override_forbidden) {
        skippedForbidden++;
        continue;
      }

      const key = `${src.product_id}:${src.grade_id}:${src.rdd_override_serial ?? 'null'}`;
      const existing = destMap.get(key);

      if (existing) {
        conflicts.push({
          product_id: src.product_id,
          dest_multiplier: existing.multiplier,
          source_multiplier: src.multiplier,
        });

        if (dto.conflict_policy === 'cancel_on_conflict') {
          throw HttpError.Conflict(
            'conflict',
            `Conflito no produto ${src.product_id} — operação cancelada`,
          );
        }

        if (dto.conflict_policy === 'keep_dest') {
          skippedConflict++;
          continue;
        }

        // overwrite
        existing.multiplier = src.multiplier;
        existing.rdd_override_serial = src.rdd_override_serial;
        existing.override_reason = src.override_reason;
        await this.items.save(existing);
        copied++;
      } else {
        const newItem = this.items.create({
          tenant_id: tenantId,
          order_id: id,
          product_id: src.product_id,
          grade_id: src.grade_id,
          multiplier: src.multiplier,
          rdd_override_serial: src.rdd_override_serial,
          override_forbidden: false,
          override_reason: null,
        });
        await this.items.save(newItem);
        copied++;
      }
    }

    return { copied, skipped_forbidden: skippedForbidden, skipped_conflict: skippedConflict, conflicts };
  }
}
