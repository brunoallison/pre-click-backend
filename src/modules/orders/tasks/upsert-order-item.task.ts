import type { Repository } from 'typeorm';
import { Order } from '../../../entities/order.entity.js';
import { OrderItem } from '../../../entities/order-item.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody } from '../../../utils/schema.js';
import { UpsertOrderItemInput, type OrderItemOutput } from '../dto/orders.dto.js';

@Injectable()
export class UpsertOrderItemTask extends Task<OrderItemOutput> {
  protected validations = [verifyBody(UpsertOrderItemInput, true)];

  constructor(
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('OrderItemRepository') private readonly items: Repository<OrderItem>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<OrderItemOutput> {
    const tenantId = input.headers.tenantId as string;
    const { orderId } = input.params as { orderId: string };
    const dto = input.body as UpsertOrderItemInput;

    const order = await this.orders.findOne({ where: { id: orderId, tenant_id: tenantId } });
    if (!order) throw HttpError.NotFound('not_found', 'Pedido não encontrado');
    if (order.status === 'closed') throw HttpError.Conflict('order_closed', 'Pedido fechado');

    const rdd = dto.rdd_override_serial ?? null;
    const existing = await this.items
      .createQueryBuilder('i')
      .where('i.order_id = :oid', { oid: orderId })
      .andWhere('i.product_id = :pid', { pid: dto.product_id })
      .andWhere('i.grade_id = :gid', { gid: dto.grade_id })
      .andWhere(
        rdd === null ? 'i.rdd_override_serial IS NULL' : 'i.rdd_override_serial = :rdd',
        rdd === null ? {} : { rdd },
      )
      .getOne();

    const entity = existing ?? this.items.create();
    entity.tenant_id = tenantId;
    entity.order_id = orderId;
    entity.product_id = dto.product_id;
    entity.grade_id = dto.grade_id;
    entity.multiplier = dto.multiplier;
    entity.rdd_override_serial = rdd;
    entity.override_forbidden = dto.override_forbidden ?? false;
    entity.override_reason = dto.override_reason ?? null;
    if (dto.multiplier === 0) {
      entity.override_forbidden = false;
      entity.override_reason = null;
    }
    const saved = await this.items.save(entity);

    return {
      id: saved.id,
      product_id: saved.product_id,
      grade_id: saved.grade_id,
      multiplier: saved.multiplier,
      rdd_override_serial: saved.rdd_override_serial,
      override_forbidden: saved.override_forbidden,
      override_reason: saved.override_reason,
      expanded_qty: 0,
      updated_at: saved.updated_at.toISOString(),
    };
  }
}
