import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduz o conceito de "Pedido" (OrderBatch): container nomeado que agrupa
 * várias lojas de uma coleção. 1 franqueado pode ter vários pedidos por coleção
 * (ex: "SS27 teste v1", "SS27 definitivo").
 *
 * Mudanças:
 *   - Cria tabela order_batch.
 *   - Adiciona coluna order.batch_id (NOT NULL, FK → order_batch, ON DELETE CASCADE).
 *   - Troca UNIQUE (collection_id, store_id) por UNIQUE (batch_id, store_id) em order.
 *
 * Wipe: a migração trunca order_item + order porque batch_id é NOT NULL e não há
 * backfill determinístico — projeto em dev, aprovado pelo operador.
 */
export class CreateOrderBatch1777000000000 implements MigrationInterface {
  name = 'CreateOrderBatch1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Cria tabela order_batch
    await queryRunner.query(`
      CREATE TABLE "order_batch" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "collection_id" uuid NOT NULL,
        "name" text NOT NULL,
        "status" text NOT NULL DEFAULT 'draft',
        "export_count" integer NOT NULL DEFAULT 0,
        "last_exported_at" TIMESTAMP WITH TIME ZONE,
        "created_by" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_order_batch" PRIMARY KEY ("id"),
        CONSTRAINT "fk_order_batch_tenant"
          FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_order_batch_collection"
          FOREIGN KEY ("collection_id") REFERENCES "collection"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_order_batch_created_by"
          FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "order_batch_tenant_collection_name_unique" ON "order_batch" ("tenant_id", "collection_id", "name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "order_batch_tenant_collection_status" ON "order_batch" ("tenant_id", "collection_id", "status")`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "order_batch" IS 'Pedido: container nomeado que agrupa 1+ lojas de uma coleção (1 franqueado × 1 coleção pode ter vários).'`,
    );
    await queryRunner.query(`COMMENT ON COLUMN "order_batch"."tenant_id" IS 'FK tenant'`);
    await queryRunner.query(`COMMENT ON COLUMN "order_batch"."collection_id" IS 'FK collection'`);
    await queryRunner.query(
      `COMMENT ON COLUMN "order_batch"."name" IS 'Nome escolhido pelo franqueado (ex: "SS27 rodada julho")'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "order_batch"."status" IS 'draft = nunca exportado | baixado = já gerou pelo menos 1 export'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "order_batch"."export_count" IS 'Quantas vezes este pedido foi exportado (re-exportações incrementam).'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "order_batch"."last_exported_at" IS 'Timestamp da última exportação bem-sucedida (null enquanto draft).'`,
    );
    await queryRunner.query(`COMMENT ON COLUMN "order_batch"."created_by" IS 'FK user criador'`);

    // 2) Wipe de order_item + order (projeto em dev; batch_id é NOT NULL sem backfill).
    await queryRunner.query(`TRUNCATE TABLE "order_item", "order" RESTART IDENTITY CASCADE`);

    // 3) Substitui UNIQUE (collection_id, store_id) por (batch_id, store_id) em order.
    await queryRunner.query(`DROP INDEX IF EXISTS "order_collection_store_unique"`);

    await queryRunner.query(`ALTER TABLE "order" ADD COLUMN "batch_id" uuid NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "order" ADD CONSTRAINT "fk_order_batch"
        FOREIGN KEY ("batch_id") REFERENCES "order_batch"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "order_batch_store_unique" ON "order" ("batch_id", "store_id")`,
    );

    await queryRunner.query(
      `COMMENT ON COLUMN "order"."batch_id" IS 'FK order_batch (pedido nomeado agrupador)'`,
    );
    await queryRunner.query(
      `COMMENT ON TABLE "order" IS 'Pedido de 1 loja × 1 coleção, dentro de um OrderBatch (pedido nomeado).'`,
    );

    // 4) Adiciona export_batch.order_batch_id (nullable — registros legados ficam NULL).
    await queryRunner.query(`ALTER TABLE "export_batch" ADD COLUMN "order_batch_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "export_batch" ADD CONSTRAINT "fk_export_batch_order_batch"
        FOREIGN KEY ("order_batch_id") REFERENCES "order_batch"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE INDEX "export_batch_order_batch" ON "export_batch" ("order_batch_id")`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "export_batch"."order_batch_id" IS 'FK order_batch (pedido nomeado agrupador) — null permitido para batches legados'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Desfaz mudanças em export_batch.
    await queryRunner.query(`DROP INDEX IF EXISTS "export_batch_order_batch"`);
    await queryRunner.query(
      `ALTER TABLE "export_batch" DROP CONSTRAINT IF EXISTS "fk_export_batch_order_batch"`,
    );
    await queryRunner.query(`ALTER TABLE "export_batch" DROP COLUMN IF EXISTS "order_batch_id"`);

    // Desfaz mudanças em order.
    await queryRunner.query(`DROP INDEX IF EXISTS "order_batch_store_unique"`);
    await queryRunner.query(`ALTER TABLE "order" DROP CONSTRAINT IF EXISTS "fk_order_batch"`);
    await queryRunner.query(`ALTER TABLE "order" DROP COLUMN IF EXISTS "batch_id"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "order_collection_store_unique" ON "order" ("collection_id", "store_id")`,
    );
    await queryRunner.query(`COMMENT ON TABLE "order" IS 'Pedido de 1 loja × 1 coleção.'`);

    // Dropa order_batch.
    await queryRunner.query(`DROP INDEX IF EXISTS "order_batch_tenant_collection_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "order_batch_tenant_collection_name_unique"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_batch"`);
  }
}
