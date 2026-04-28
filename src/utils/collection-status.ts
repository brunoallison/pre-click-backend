import type { Collection } from '../entities/collection.entity.js';

/**
 * Status efetivo da coleção, derivado de janelas + status persistido.
 *
 * - `next`     → janela de pedido ainda não abriu
 * - `open`     → dentro da janela de pedido (aceita criação de pedido)
 * - `delivery` → janela de pedido fechou, mas entrega ainda em curso
 * - `closed`   → entrega encerrada OU status persistido = 'closed'
 *
 * Quando datas são nulas, respeita o status persistido (`draft` → `next`,
 * `open` persistido → `open`, `closed` persistido → `closed`).
 */
export type DerivedCollectionStatus = 'next' | 'open' | 'delivery' | 'closed';

export function resolveCollectionStatus(
  col: Pick<
    Collection,
    'status' | 'order_start_at' | 'order_end_at' | 'delivery_start_at' | 'delivery_end_at'
  >,
  now: Date = new Date(),
): DerivedCollectionStatus {
  if (col.status === 'closed') return 'closed';
  const t = now.getTime();
  const orderStart = col.order_start_at?.getTime();
  const orderEnd = col.order_end_at?.getTime();
  const deliveryEnd = col.delivery_end_at?.getTime();

  if (orderStart !== undefined && t < orderStart) return 'next';
  if (orderEnd !== undefined && t <= orderEnd) return 'open';
  if (deliveryEnd !== undefined && t <= deliveryEnd) return 'delivery';
  if (deliveryEnd !== undefined && t > deliveryEnd) return 'closed';
  return col.status === 'open' ? 'open' : 'next';
}

/** Status que aceitam criação de pedido. */
export const ORDERABLE_STATUSES: ReadonlySet<DerivedCollectionStatus> = new Set([
  'next',
  'open',
]);

export function isOrderable(status: DerivedCollectionStatus): boolean {
  return ORDERABLE_STATUSES.has(status);
}
