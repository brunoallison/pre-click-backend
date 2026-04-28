import 'reflect-metadata';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { In } from 'typeorm';
import { AppDataSource } from '../data-source.js';
import { Collection } from '../../entities/collection.entity.js';
import { Grade } from '../../entities/grade.entity.js';
import { GradeSizeQty } from '../../entities/grade-size-qty.entity.js';
import { Order } from '../../entities/order.entity.js';
import { OrderBatch } from '../../entities/order-batch.entity.js';
import { OrderItem } from '../../entities/order-item.entity.js';
import { Product } from '../../entities/product.entity.js';
import { Store } from '../../entities/store.entity.js';
import { Tenant } from '../../entities/tenant.entity.js';
import { User } from '../../entities/user.entity.js';
import { logger } from '../../utils/logger.js';

interface Args {
  file: string;
  collection: string;
  batchName: string;
  dryRun: boolean;
  skipMissingSkus: boolean;
}

function parseArgs(): Args {
  const raw: Record<string, string | boolean> = {};
  for (const a of process.argv.slice(2)) {
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=', 2);
    raw[k] = v ?? true;
  }
  if (typeof raw.file !== 'string') throw new Error('--file=<path> é obrigatório');
  if (typeof raw.collection !== 'string') throw new Error('--collection=<code> é obrigatório');
  if (typeof raw['batch-name'] !== 'string') throw new Error('--batch-name=<string> é obrigatório');
  return {
    file: raw.file,
    collection: raw.collection,
    batchName: raw['batch-name'],
    dryRun: raw['dry-run'] === true,
    skipMissingSkus: raw['skip-missing-skus'] === true,
  };
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function dateToExcelSerial(d: Date): number {
  return Math.floor((d.getTime() - EXCEL_EPOCH_UTC) / 86_400_000);
}

interface XlsxRow {
  rdd: Date;
  loja: string;
  customer: string;
  article: string;
  qty: number;
  size: string;
}

async function readXlsxRows(filePath: string): Promise<XlsxRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`Arquivo sem sheets: ${filePath}`);

  const out: XlsxRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const rdd = row.getCell(2).value;
    const loja = row.getCell(3).value;
    const customer = row.getCell(4).value;
    const article = row.getCell(5).value;
    const qty = row.getCell(6).value;
    const size = row.getCell(7).value;

    if (!(rdd instanceof Date)) return;
    if (customer == null || article == null || size == null) return;
    if (typeof qty !== 'number' || qty <= 0) return;

    out.push({
      rdd,
      loja: String(loja ?? ''),
      customer: String(customer),
      article: String(article).trim(),
      qty: Math.round(qty),
      size: String(size).trim(),
    });
  });
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const filePath = path.resolve(process.cwd(), args.file);

  logger.info({ args, filePath }, 'seed-orders: iniciando');

  await AppDataSource.initialize();

  try {
    const tenant = await AppDataSource.getRepository(Tenant).findOne({ where: {} });
    if (!tenant) throw new Error('Nenhum tenant cadastrado no banco.');

    const user = await AppDataSource.getRepository(User).findOne({
      where: { role: 'super_admin', is_active: true },
    });
    if (!user) throw new Error('Nenhum super_admin ativo encontrado (created_by).');

    const collection = await AppDataSource.getRepository(Collection).findOne({
      where: { code: args.collection, country: 'BR' },
    });
    if (!collection) throw new Error(`Coleção ${args.collection} (BR) não encontrada.`);

    logger.info(
      { tenant: tenant.slug, collection: collection.code, user: user.email },
      'contexto resolvido',
    );

    const rows = await readXlsxRows(filePath);
    if (rows.length === 0) throw new Error('Nenhuma linha válida no xlsx.');
    logger.info({ rows: rows.length }, 'xlsx parseado');

    const customerIds = [...new Set(rows.map((r) => r.customer))];
    const stores = await AppDataSource.getRepository(Store).find({
      where: { tenant_id: tenant.id, customer_id_sap: In(customerIds) },
    });
    const storeByCustomer = new Map(stores.map((s) => [String(s.customer_id_sap), s]));
    const missingStores = customerIds.filter((c) => !storeByCustomer.has(c));
    if (missingStores.length) {
      throw new Error(
        `Lojas não cadastradas (customer_id_sap): ${missingStores.join(', ')}. ` +
          `Cadastre antes de rodar o importer.`,
      );
    }
    logger.info({ stores: stores.length }, 'lojas resolvidas');

    const articles = [...new Set(rows.map((r) => r.article))];
    const products = await AppDataSource.getRepository(Product).find({
      where: { collection_id: collection.id, article_sku: In(articles) },
    });
    const productByArticle = new Map(products.map((p) => [p.article_sku, p]));
    const missingArticles = articles.filter((a) => !productByArticle.has(a));

    if (missingArticles.length) {
      logger.warn(
        { count: missingArticles.length, sample: missingArticles.slice(0, 15) },
        'SKUs ausentes na coleção',
      );
      if (!args.skipMissingSkus) {
        throw new Error(
          `${missingArticles.length} SKUs não encontrados na coleção ${args.collection}. ` +
            `Use --skip-missing-skus pra ignorar essas linhas.`,
        );
      }
    }

    interface Group {
      storeId: string;
      productId: string;
      article: string;
      rddSerial: number;
      sizes: Map<string, number>;
    }

    const groups = new Map<string, Group>();
    let skippedRows = 0;
    let totalQty = 0;

    for (const r of rows) {
      const product = productByArticle.get(r.article);
      if (!product) {
        skippedRows++;
        continue;
      }
      const store = storeByCustomer.get(r.customer);
      if (!store) {
        skippedRows++;
        continue;
      }
      const rddSerial = dateToExcelSerial(r.rdd);
      const key = `${store.id}|${product.id}|${rddSerial}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          storeId: store.id,
          productId: product.id,
          article: r.article,
          rddSerial,
          sizes: new Map(),
        };
        groups.set(key, g);
      }
      g.sizes.set(r.size, (g.sizes.get(r.size) ?? 0) + r.qty);
      totalQty += r.qty;
    }

    logger.info({ groups: groups.size, totalQty, skippedRows }, 'agrupamento concluído');

    console.log('\n=== Resumo ===');
    console.log(`Tenant:           ${tenant.slug}`);
    console.log(`Coleção:          ${collection.code}`);
    console.log(`Batch name:       ${args.batchName}`);
    console.log(`Lojas envolvidas: ${storeByCustomer.size}`);
    console.log(`SKUs encontrados: ${products.length} / ${articles.length}`);
    console.log(`SKUs ausentes:    ${missingArticles.length}`);
    console.log(`Linhas xlsx:      ${rows.length}`);
    console.log(`Linhas puladas:   ${skippedRows}`);
    console.log(`Order items:      ${groups.size}`);
    console.log(`Peças totais:     ${totalQty}`);

    if (args.dryRun) {
      console.log('\n[--dry-run] sem persistir nada.');
      return;
    }

    await AppDataSource.transaction(async (manager) => {
      const existing = await manager.findOne(OrderBatch, {
        where: { tenant_id: tenant.id, collection_id: collection.id, name: args.batchName },
      });
      if (existing) {
        throw new Error(
          `OrderBatch '${args.batchName}' já existe (id=${existing.id}). ` +
            `Renomeie ou limpe antes.`,
        );
      }

      const batch = await manager.save(OrderBatch, {
        tenant_id: tenant.id,
        collection_id: collection.id,
        name: args.batchName,
        status: 'draft',
        export_count: 0,
        last_exported_at: null,
        created_by: user.id,
      });

      const storeIds = [...new Set([...groups.values()].map((g) => g.storeId))];
      const orderByStore = new Map<string, Order>();
      for (const sid of storeIds) {
        const order = await manager.save(Order, {
          tenant_id: tenant.id,
          collection_id: collection.id,
          batch_id: batch.id,
          store_id: sid,
          status: 'draft',
          created_by: user.id,
        });
        orderByStore.set(sid, order);
      }
      logger.info({ batchId: batch.id, orders: orderByStore.size }, 'batch+orders criados');

      let gradeIdx = 0;
      for (const g of groups.values()) {
        const totalPieces = [...g.sizes.values()].reduce((a, b) => a + b, 0);
        const gradeCode = `CUSTOM_${args.batchName}_${g.article}_${gradeIdx++}`.slice(0, 80);
        const grade = await manager.save(Grade, {
          collection_id: collection.id,
          tenant_id: tenant.id,
          code: gradeCode,
          total_pieces: totalPieces,
          is_system: false,
        });
        const sizeRows = [...g.sizes.entries()].map(([size, qty]) => ({
          grade_id: grade.id,
          size,
          qty,
        }));
        await manager.save(GradeSizeQty, sizeRows);

        await manager.save(OrderItem, {
          tenant_id: tenant.id,
          order_id: orderByStore.get(g.storeId)!.id,
          product_id: g.productId,
          grade_id: grade.id,
          multiplier: 1,
          rdd_override_serial: g.rddSerial,
          override_forbidden: false,
          override_reason: null,
        });
      }
    });

    console.log('\n✓ Importação concluída.');
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error({ err: message, stack }, 'seed-orders: fatal');
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
});
