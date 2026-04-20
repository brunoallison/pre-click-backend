import type { Repository } from 'typeorm';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { verifyBody, verifyParams } from '../../../utils/schema.js';
import { HttpError } from '../../../utils/error.js';
import { logger } from '../../../utils/logger.js';
import { Order } from '../../../entities/order.entity.js';
import { OrderItem } from '../../../entities/order-item.entity.js';
import { Product } from '../../../entities/product.entity.js';
import { Store } from '../../../entities/store.entity.js';
import { Collection } from '../../../entities/collection.entity.js';
import { ExportBatch } from '../../../entities/export-batch.entity.js';
import { ExportBatchFile } from '../../../entities/export-batch-file.entity.js';
import { OrderExpansionService } from '../../../services/order-expansion.service.js';
import { ExportBuilderService } from '../../../services/export-builder.service.js';
import { ClickWriterProvider } from '../../../providers/excel/click-writer.provider.js';
import { GcsProvider } from '../../../providers/gcs/gcs.provider.js';
import { IsUUID } from 'class-validator';
import {
  CreateExportInput,
  type CreateExportOutput,
  type ExportBatchOutput,
  type DryRunOutput,
} from '../dto/exports.dto.js';

class ExportParams {
  @IsUUID()
  orderId!: string;
}

@Injectable()
export class CreateExportTask extends Task<CreateExportOutput> {
  protected validations = [verifyParams(ExportParams), verifyBody(CreateExportInput, true)];

  constructor(
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('OrderItemRepository') private readonly orderItems: Repository<OrderItem>,
    @Inject('ProductRepository') private readonly products: Repository<Product>,
    @Inject('StoreRepository') private readonly stores: Repository<Store>,
    @Inject('CollectionRepository') private readonly collections: Repository<Collection>,
    @Inject('ExportBatchRepository') private readonly batches: Repository<ExportBatch>,
    @Inject('ExportBatchFileRepository')
    private readonly batchFiles: Repository<ExportBatchFile>,
    @Inject(OrderExpansionService) private readonly expansion: OrderExpansionService,
    @Inject(ExportBuilderService) private readonly builder: ExportBuilderService,
    @Inject(ClickWriterProvider) private readonly writer: ClickWriterProvider,
    @Inject(GcsProvider) private readonly gcs: GcsProvider,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<CreateExportOutput> {
    const tenantId = input.headers.tenantId as string;
    const userId = input.headers.userId as string;
    const { orderId } = input.params as { orderId: string };
    const dto = input.body as CreateExportInput;

    // 1. Carregar pedido com store + collection
    const order = await this.orders.findOne({
      where: { id: orderId, tenant_id: tenantId },
    });
    if (!order) throw HttpError.NotFound('not_found', 'Pedido não encontrado');

    const store = await this.stores.findOne({ where: { id: order.store_id } });
    if (!store) throw HttpError.NotFound('not_found', 'Loja não encontrada');

    const collection = await this.collections.findOne({ where: { id: order.collection_id } });
    if (!collection) throw HttpError.NotFound('not_found', 'Coleção não encontrada');

    // 2. Validação: loja deve ter customer_id_sap
    if (!store.customer_id_sap) {
      throw HttpError.Unprocessable(
        'missing_customer_id',
        `Loja "${store.legal_name}" não tem Customer ID cadastrado — não é possível exportar`,
      );
    }

    // 3. Carregar itens do pedido
    const items = await this.orderItems.find({ where: { order_id: orderId, tenant_id: tenantId } });
    if (items.length === 0) {
      throw HttpError.Unprocessable('empty_order', 'Pedido sem itens — nada a exportar');
    }

    // 4. Expandir linhas (order_item × grade_size_qty)
    const expanded = await this.expansion.expand(items);
    const positiveLines = expanded.filter((l) => l.qty > 0);
    if (positiveLines.length === 0) {
      throw HttpError.Unprocessable(
        'zero_qty',
        'Todos os itens têm quantidade zero após expansão — nada a exportar',
      );
    }

    // 5. Carregar produtos para montar as colunas do Click
    const productIds = [...new Set(positiveLines.map((l) => l.product_id))];
    const productList = await this.products.findByIds(productIds);
    const productMap = new Map(productList.map((p) => [p.id, p]));

    // 6. Montar ClickRow[]
    const soldTo = Number(store.customer_id_sap);
    const clickRows = positiveLines
      .map((line) => {
        const product = productMap.get(line.product_id);
        if (!product) return null;

        // RDD: usa override do item ou serial derivado do local_rid do produto
        const rddSerial = line.rdd_override_serial ?? dateToExcelSerial(product.local_rid);

        return {
          sold_to: soldTo,
          nome_cliente: store.legal_name,
          divisao: product.division ?? null,
          genero: product.gender ?? null,
          grupo_produto: product.age_group ?? null,
          categoria: product.category ?? null,
          tipo_produto: product.prod_type ?? null,
          article: product.article_sku,
          article_name: product.local_description,
          color: product.color ?? null,
          image_url: null,
          ean: null,
          upc: null,
          data_inicial: null,
          data_final: product.local_red !== null ? dateToExcelSerial(product.local_red) : null,
          rdd: rddSerial,
          tamanho: line.size,
          pb: null,
          pdv: Number(product.rrp),
          currency: 'BRL',
          inventory: null,
          total_qty: 0,
          observacoes: null,
          qty: line.qty,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // 7. Verificar invariante qty: sum(multiplier × grade.total_pieces) == sum(col X)
    // Carregamos grade.total_pieces via items
    const gradeIds = [...new Set(items.map((i) => i.grade_id))];
    const gradeRepo = this.batches.manager.getRepository('grade');
    const grades = await gradeRepo.findByIds(gradeIds);
    const gradeTotalMap = new Map<string, number>(
      (grades as Array<{ id: string; total_pieces: number }>).map((g) => [g.id, g.total_pieces]),
    );

    const itemMultiplierTotals = items
      .filter((i) => i.multiplier > 0)
      .map((i) => ({
        multiplier: i.multiplier,
        grade_total_pieces: gradeTotalMap.get(i.grade_id) ?? 0,
      }));

    this.builder.assertQtyInvariant(itemMultiplierTotals, clickRows);

    // 8. Dividir em chunks por loja/rdd
    const chunks = this.builder.splitBy400(clickRows);

    if (dto.dry_run) {
      const preview = chunks.map((chunk, idx) => ({
        file_name: this.builder.fileNameFor(
          collection.code,
          store.store_number,
          store.legal_name,
          chunk[0]?.rdd ?? null,
          idx,
        ),
        row_count: chunk.length,
        rdd: chunk[0]?.rdd ?? null,
      }));

      return {
        dry_run: true,
        validations: { blockers: [], warnings: [] },
        preview: {
          total_rows: clickRows.length,
          total_files: chunks.length,
          files: preview,
        },
      } satisfies DryRunOutput;
    }

    // 9. Gravar batch
    const batch = this.batches.create({
      tenant_id: tenantId,
      order_id: orderId,
      parent_batch_id: null,
      strategy: dto.strategy,
      chunk_size_limit: 400,
      total_rows: clickRows.length,
      total_files: chunks.length,
      triggered_by: userId,
    });
    const savedBatch = await this.batches.save(batch);

    // 10. Gerar xlsx e salvar no GCS
    const savedFiles: ExportBatchFile[] = [];
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      const fileName = this.builder.fileNameFor(
        collection.code,
        store.store_number,
        store.legal_name,
        chunk[0]?.rdd ?? null,
        idx,
      );

      const meta = {
        cart_name: `${collection.code} - ${store.legal_name}`,
        nome_destinatario: store.legal_name,
        numero_destinatario: store.customer_id_sap ?? '',
      };

      const xlsxBuffer = await this.writer.write(chunk, meta);
      const s3Key = `exports/${tenantId}/${savedBatch.id}/${fileName}`;
      await this.gcs.upload(
        s3Key,
        xlsxBuffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      const file = this.batchFiles.create({
        batch_id: savedBatch.id,
        sequence: idx + 1,
        file_name: fileName,
        gcs_key: s3Key,
        row_count: chunk.length,
        rdd: chunk[0]?.rdd ?? null,
        store_id: store.id,
        status: 'ready',
        downloaded_at: null,
        sent_at: null,
        error_file_id: null,
      });
      savedFiles.push(await this.batchFiles.save(file));
    }

    logger.info(
      { batch_id: savedBatch.id, total_files: chunks.length, total_rows: clickRows.length },
      'export-builder: batch gerado com sucesso',
    );

    return {
      id: savedBatch.id,
      order_id: savedBatch.order_id,
      tenant_id: savedBatch.tenant_id,
      strategy: savedBatch.strategy,
      total_rows: savedBatch.total_rows,
      total_files: savedBatch.total_files,
      triggered_by: savedBatch.triggered_by,
      created_at: savedBatch.created_at.toISOString(),
      files: savedFiles.map((f) => ({
        id: f.id,
        sequence: f.sequence,
        file_name: f.file_name,
        gcs_key: f.gcs_key,
        row_count: f.row_count,
        rdd: f.rdd,
        store_id: f.store_id,
        status: f.status,
        downloaded_at: null,
        sent_at: null,
      })),
    } satisfies ExportBatchOutput;
  }
}

/**
 * Converte data ISO (yyyy-MM-dd) para serial Excel (dias desde 1900-01-01, com bug do 1900).
 * Necessário para col P (RDD) e col O (data_final) do Click.
 */
function dateToExcelSerial(isoDate: string): number {
  // Serial Excel: dias desde 1899-12-30 (compatível com bug de 1900 do Lotus 1-2-3 / Excel)
  const epoch = new Date('1899-12-30T00:00:00.000Z');
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  const diffMs = date.getTime() - epoch.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
