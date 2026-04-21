import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cria a tabela batch_hidden_product para armazenar produtos
 * explicitamente ocultos pelo operador em um pedido específico.
 *
 * Mudanças:
 *   - Cria tabela batch_hidden_product com PK composta (batch_id, product_id).
 *   - FK batch_id → order_batch(id) ON DELETE CASCADE.
 *   - FK product_id → product(id) ON DELETE CASCADE.
 */
export class CreateBatchHiddenProduct1779000000000 implements MigrationInterface {
  name = 'CreateBatchHiddenProduct1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "batch_hidden_product" (
        "batch_id"   uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "hidden_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_batch_hidden_product" PRIMARY KEY ("batch_id", "product_id"),
        CONSTRAINT "fk_batch_hidden_product_batch"
          FOREIGN KEY ("batch_id") REFERENCES "order_batch"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_batch_hidden_product_product"
          FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `COMMENT ON TABLE "batch_hidden_product" IS 'Produtos explicitamente ocultos pelo operador em um pedido específico.'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "batch_hidden_product"."batch_id" IS 'FK order_batch'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "batch_hidden_product"."product_id" IS 'FK product'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "batch_hidden_product"."hidden_at" IS 'Momento em que o operador ocultou o produto'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "batch_hidden_product"`);
  }
}
