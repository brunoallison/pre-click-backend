import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SIM_FW26_APP_BARRA } from '../database/seeds/orders-data/sim-fw26-app-barra.data.js';
import { SIM_FW26_FTW_BCS_OCS } from '../database/seeds/orders-data/sim-fw26-ftw-bcs-ocs.data.js';
import type { SimDataset } from '../database/seeds/orders-data/types.js';

/**
 * Carrega 2 datasets de simulação (FW26 APP BCS Barra + FW26 FTW BCS/OCS) como
 * pedidos reais. Idempotente: skipa o batch se já existir. Os dados ficam em
 * arquivos `*.data.ts` que devem ser removidos após a simulação (junto com
 * esta migration — ver bloco DOWN).
 */

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function dateToExcelSerial(dateStr: string): number {
  const d = new Date(dateStr);
  return Math.floor((d.getTime() - EXCEL_EPOCH_UTC) / 86_400_000);
}

interface QueryRow {
  id: string;
}

interface StoreRow {
  id: string;
  sap: string;
}

interface ProductRow {
  id: string;
  article_sku: string;
}

async function importDataset(qr: QueryRunner, dataset: SimDataset): Promise<void> {
  const tenantRows = (await qr.query(`SELECT id FROM tenant LIMIT 1`)) as QueryRow[];
  if (tenantRows.length === 0) {
    throw new Error('seed-orders: nenhum tenant cadastrado');
  }
  const tenantId = tenantRows[0].id;

  const userRows = (await qr.query(
    `SELECT id FROM "user" WHERE role = 'super_admin' AND is_active = true LIMIT 1`,
  )) as QueryRow[];
  if (userRows.length === 0) {
    throw new Error('seed-orders: nenhum super_admin ativo');
  }
  const userId = userRows[0].id;

  const collectionRows = (await qr.query(
    `SELECT id FROM collection WHERE code = $1 AND country = 'BR' LIMIT 1`,
    [dataset.collection],
  )) as QueryRow[];
  if (collectionRows.length === 0) {
    throw new Error(`seed-orders: coleção ${dataset.collection} (BR) não encontrada`);
  }
  const collectionId = collectionRows[0].id;

  const existingBatch = (await qr.query(
    `SELECT id FROM order_batch WHERE tenant_id = $1 AND collection_id = $2 AND name = $3`,
    [tenantId, collectionId, dataset.batchName],
  )) as QueryRow[];
  if (existingBatch.length > 0) {
    console.log(`[seed-orders] '${dataset.batchName}' já existe, skip.`);
    return;
  }

  const customerIds = [...new Set(dataset.rows.map((r) => r.customer))];
  const stores = (await qr.query(
    `SELECT id, customer_id_sap::text AS sap
       FROM store
      WHERE tenant_id = $1 AND customer_id_sap = ANY($2::bigint[])`,
    [tenantId, customerIds],
  )) as StoreRow[];
  const storeByCustomer = new Map(stores.map((s) => [s.sap, s.id]));
  const missingStores = customerIds.filter((c) => !storeByCustomer.has(c));
  if (missingStores.length > 0) {
    throw new Error(`seed-orders: lojas faltando (customer_id_sap): ${missingStores.join(', ')}`);
  }

  const articles = [...new Set(dataset.rows.map((r) => r.article))];
  const products = (await qr.query(
    `SELECT id, article_sku FROM product WHERE collection_id = $1 AND article_sku = ANY($2::text[])`,
    [collectionId, articles],
  )) as ProductRow[];
  const productByArticle = new Map(products.map((p) => [p.article_sku, p.id]));
  const missingArticles = articles.filter((a) => !productByArticle.has(a));

  if (missingArticles.length > 0) {
    console.log(
      `[seed-orders] '${dataset.batchName}': ${missingArticles.length}/${articles.length} ` +
        `SKUs ausentes na coleção ${dataset.collection}, pulando linhas.`,
    );
  }

  interface Group {
    storeId: string;
    productId: string;
    article: string;
    rddSerial: number;
    sizes: Map<string, number>;
  }

  const groups = new Map<string, Group>();
  let totalQty = 0;

  for (const r of dataset.rows) {
    const productId = productByArticle.get(r.article);
    if (!productId) continue;
    const storeId = storeByCustomer.get(r.customer);
    if (!storeId) continue;

    const rddSerial = dateToExcelSerial(r.rdd);
    const key = `${storeId}|${productId}|${rddSerial}`;
    let g = groups.get(key);
    if (!g) {
      g = { storeId, productId, article: r.article, rddSerial, sizes: new Map() };
      groups.set(key, g);
    }
    g.sizes.set(r.size, (g.sizes.get(r.size) ?? 0) + r.qty);
    totalQty += r.qty;
  }

  if (groups.size === 0) {
    console.log(`[seed-orders] '${dataset.batchName}': nenhum item após match. Skip.`);
    return;
  }

  const batchInsert = (await qr.query(
    `INSERT INTO order_batch (tenant_id, collection_id, name, status, export_count, last_exported_at, created_by)
     VALUES ($1, $2, $3, 'draft', 0, NULL, $4) RETURNING id`,
    [tenantId, collectionId, dataset.batchName, userId],
  )) as QueryRow[];
  const batchId = batchInsert[0].id;

  const storeIds = [...new Set([...groups.values()].map((g) => g.storeId))];
  const orderByStore = new Map<string, string>();
  for (const sid of storeIds) {
    const orderRows = (await qr.query(
      `INSERT INTO "order" (tenant_id, collection_id, batch_id, store_id, status, created_by)
       VALUES ($1, $2, $3, $4, 'draft', $5) RETURNING id`,
      [tenantId, collectionId, batchId, sid, userId],
    )) as QueryRow[];
    orderByStore.set(sid, orderRows[0].id);
  }

  let gradeIdx = 0;
  for (const g of groups.values()) {
    const totalPieces = [...g.sizes.values()].reduce((a, b) => a + b, 0);
    const gradeCode = `CUSTOM_${dataset.batchName}_${g.article}_${gradeIdx++}`.slice(0, 80);
    const gradeRows = (await qr.query(
      `INSERT INTO grade (collection_id, tenant_id, code, total_pieces, is_system)
       VALUES ($1, $2, $3, $4, false) RETURNING id`,
      [collectionId, tenantId, gradeCode, totalPieces],
    )) as QueryRow[];
    const gradeId = gradeRows[0].id;

    for (const [size, qty] of g.sizes) {
      await qr.query(`INSERT INTO grade_size_qty (grade_id, size, qty) VALUES ($1, $2, $3)`, [
        gradeId,
        size,
        qty,
      ]);
    }

    await qr.query(
      `INSERT INTO order_item
         (tenant_id, order_id, product_id, grade_id, multiplier, rdd_override_serial, override_forbidden, override_reason)
       VALUES ($1, $2, $3, $4, 1, $5, false, NULL)`,
      [tenantId, orderByStore.get(g.storeId), g.productId, gradeId, g.rddSerial],
    );
  }

  console.log(
    `[seed-orders] '${dataset.batchName}': ${orderByStore.size} orders, ${groups.size} items, ${totalQty} peças.`,
  );
}

export class SeedSimulationOrders1780000000000 implements MigrationInterface {
  name = 'SeedSimulationOrders1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await importDataset(queryRunner, SIM_FW26_APP_BARRA);
    await importDataset(queryRunner, SIM_FW26_FTW_BCS_OCS);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const dataset of [SIM_FW26_APP_BARRA, SIM_FW26_FTW_BCS_OCS]) {
      // delete cascade do order_batch limpa: order, order_item, grade_size_qty (via grade FK)
      await queryRunner.query(`DELETE FROM order_batch WHERE name = $1`, [dataset.batchName]);
      // grades custom criadas pela migration ficam órfãs — limpar
      await queryRunner.query(`DELETE FROM grade WHERE is_system = false AND code LIKE $1`, [
        `CUSTOM_${dataset.batchName}_%`,
      ]);
    }
  }
}
